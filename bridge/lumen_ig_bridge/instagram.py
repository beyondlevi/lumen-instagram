"""The Instagram account behind the bridge: one instagrapi client, used by one person.

Reads go through `private_request` and `parse` (raw JSON, parsed defensively);
writes use instagrapi's methods, which carry the request details Instagram's
Android app sends. Calls are serialised: instagrapi's client isn't thread-safe,
and one person's glasses don't need parallel requests to Instagram.

The session (device ids and cookies) lives in a JSON file, so restarts keep the
same device. It comes from `python -m lumen_ig_bridge login` (username and
password, as the Android app signs in), or on the first start from IG_USERNAME
and IG_PASSWORD (IG_TOTP_SECRET for two-factor). Replacing the file while the
bridge runs takes effect on the next request.
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, TypeVar

from instagrapi import Client
from instagrapi.exceptions import TwoFactorRequired

from . import errors, parse
from .config import Config
from .errors import BridgeError
from .media import MediaSigner

log = logging.getLogger("lumen_ig_bridge")

T = TypeVar("T")

# How long a read is answered from memory: the app polls the inbox and the open
# thread, and two screens asking at once shouldn't cost two Instagram requests.
INBOX_TTL = 8.0
THREAD_TTL = 3.0
# How often the session file is rewritten (Instagram rotates some cookies).
DUMP_EVERY = 600.0


class _Cache:
    def __init__(self) -> None:
        self._entries: Dict[Tuple, Tuple[float, Any]] = {}

    def get(self, key: Tuple, ttl: float) -> Any:
        entry = self._entries.get(key)
        if entry and time.monotonic() - entry[0] < ttl:
            return entry[1]
        return None

    def put(self, key: Tuple, value: Any) -> None:
        self._entries[key] = (time.monotonic(), value)

    def drop(self, prefix: Tuple) -> None:
        for key in [k for k in self._entries if k[: len(prefix)] == prefix]:
            del self._entries[key]


class Instagram:
    def __init__(self, config: Config, signer: MediaSigner, client_factory: Callable[[], Client] = Client):
        self._config = config
        self._signer = signer
        self._client_factory = client_factory
        self._client: Optional[Client] = None
        self._session_mtime: Optional[float] = None
        self._last_dump = 0.0
        self._lock = threading.RLock()
        self._cache = _Cache()

    # ------------------------------------------------------------ session

    def _new_client(self) -> Client:
        client = self._client_factory()
        if self._config.proxy:
            client.set_proxy(self._config.proxy)
        if self._config.locale:
            client.set_locale(self._config.locale)
        if self._config.timezone_offset is not None:
            client.set_timezone_offset(self._config.timezone_offset)
        return client

    def _session_changed(self) -> bool:
        path = self._config.session_file
        mtime = path.stat().st_mtime if path.exists() else None
        return mtime != self._session_mtime

    def _connect(self) -> Client:
        path = self._config.session_file
        client = self._new_client()
        if path.exists():
            client.load_settings(path)
            if not client.user_id:
                raise errors.login_required("The session file has no signed-in account.")
            log.info("Loaded the Instagram session from %s", path)
        elif self._config.username and self._config.password:
            log.info("Signing in as %s", self._config.username)

            def no_prompt(question: str) -> str:
                raise errors.login_required(f"Instagram asked for a code; run: python -m lumen_ig_bridge login ({question.strip()})")

            password_login(client, self._config.username, self._config.password, no_prompt, self._config.totp_secret)
            self._dump(client)
        elif self._config.sessionid:
            log.warning("Signing in with IG_SESSIONID: Instagram often ends browser sessions used this way")
            client.login_by_sessionid(self._config.sessionid)
            self._dump(client)
        else:
            raise errors.login_required("No Instagram session. Run: python -m lumen_ig_bridge login")
        self._session_mtime = path.stat().st_mtime if path.exists() else None
        self._cache = _Cache()
        return client

    def _dump(self, client: Client) -> None:
        path = self._config.session_file
        path.parent.mkdir(parents=True, exist_ok=True)
        client.dump_settings(path)
        try:
            path.chmod(0o600)
        except OSError:
            pass
        self._session_mtime = path.stat().st_mtime
        self._last_dump = time.monotonic()

    def _call(self, action: Callable[[Client], T]) -> T:
        with self._lock:
            try:
                if self._client is None or self._session_changed():
                    self._client = self._connect()
                result = action(self._client)
                if time.monotonic() - self._last_dump > DUMP_EVERY:
                    self._dump(self._client)
                return result
            except BridgeError:
                raise
            except Exception as error:  # instagrapi raises many types; map them all
                mapped = errors.from_instagram(error)
                log.warning("Instagram call failed: %s (%s)", mapped.code, error.__class__.__name__)
                raise mapped from error

    def viewer_id(self) -> str:
        return self._call(lambda client: str(client.user_id))

    # ------------------------------------------------------------ account

    def me(self) -> Dict[str, Any]:
        def action(client: Client) -> Dict[str, Any]:
            raw = client.private_request("accounts/current_user/", params={"edit": "true"})
            return parse.account(raw, self._signer.proxy)

        return self._call(action)

    # ------------------------------------------------------------ reels

    def reels(self, cursor: Optional[str]) -> Dict[str, Any]:
        def action(client: Client) -> Dict[str, Any]:
            raw = client.private_request("clips/connected/", data=" ", params={"max_id": cursor or ""})
            return parse.reels_page(raw, self._signer.proxy)

        return self._call(action)

    def reel_by_code(self, code: str) -> Dict[str, Any]:
        def action(client: Client) -> Dict[str, Any]:
            pk = client.media_pk_from_code(code)
            raw = client.private_request(f"media/{pk}/info/")
            items = raw.get("items") or []
            reel = parse.reel(items[0], self._signer.proxy) if items else None
            if reel is None:
                raise BridgeError(404, "not_found", "This post has no video to play.")
            return reel

        return self._call(action)

    def set_liked(self, media_id: str, liked: bool) -> bool:
        return self._call(lambda client: bool(client.media_like(media_id) if liked else client.media_unlike(media_id)))

    def set_saved(self, media_id: str, saved: bool) -> bool:
        return self._call(lambda client: bool(client.media_save(media_id) if saved else client.media_unsave(media_id)))

    def mark_reels_seen(self, media_ids: Sequence[str]) -> bool:
        ids = [media_id for media_id in media_ids if media_id][:20]
        if not ids:
            return True
        return self._call(lambda client: bool(client.clip_seen(ids)))

    def comments(self, media_id: str, cursor: Optional[str]) -> Dict[str, Any]:
        def action(client: Client) -> Dict[str, Any]:
            params = {"can_support_threading": "true", "permalink_enabled": "false"}
            if cursor:
                params["max_id"] = cursor
            raw = client.private_request(f"media/{media_id}/comments/", params=params)
            return parse.comments_page(raw, self._signer.proxy)

        return self._call(action)

    def share_reel(self, media_id: str, thread_ids: Sequence[str]) -> None:
        targets = [int(thread_id) for thread_id in thread_ids]

        def action(client: Client) -> None:
            client.direct_media_share(media_id, thread_ids=targets, media_type="video")

        self._call(action)
        for thread_id in thread_ids:
            self._cache.drop(("thread", str(thread_id)))
        self._cache.drop(("inbox",))

    # ------------------------------------------------------------ Direct

    def inbox(self, cursor: Optional[str]) -> Dict[str, Any]:
        key = ("inbox", cursor or "")
        cached = self._cache.get(key, INBOX_TTL)
        if cached is not None:
            return cached

        def action(client: Client) -> Dict[str, Any]:
            params: Dict[str, str] = {}
            tracking = getattr(client, "_direct_request_tracking_params", None)
            if callable(tracking):
                params.update(tracking())
            params.update({
                "visual_message_return_type": "unseen",
                "thread_message_limit": "1",
                "persistentBadging": "true",
                "limit": "20",
                "is_prefetching": "false",
                "fetch_reason": "initial_snapshot",
                "include_old_mrs": "false",
                "no_pending_badge": "true",
                "push_disabled": "true",
            })
            if cursor:
                params.update({"cursor": cursor, "direction": "older", "fetch_reason": "page_scroll"})
            raw = client.private_request("direct_v2/inbox/", params=params)
            return parse.inbox_page(raw, str(client.user_id), self._signer.proxy)

        result = self._call(action)
        self._cache.put(key, result)
        return result

    def thread(self, thread_id: str, cursor: Optional[str]) -> Dict[str, Any]:
        key = ("thread", thread_id, cursor or "")
        cached = self._cache.get(key, THREAD_TTL)
        if cached is not None:
            return cached

        def action(client: Client) -> Dict[str, Any]:
            params = {"visual_message_return_type": "unseen", "direction": "older", "seq_id": "40065", "limit": "20"}
            if cursor:
                params["cursor"] = cursor
            raw = client.private_request(f"direct_v2/threads/{thread_id}/", params=params)
            return parse.thread_page(raw, str(client.user_id), self._signer.proxy)

        result = self._call(action)
        self._cache.put(key, result)
        return result

    def _changed(self, thread_id: str) -> None:
        self._cache.drop(("thread", thread_id))
        self._cache.drop(("inbox",))

    def send_text(self, thread_id: str, text: str) -> Optional[str]:
        message = self._call(lambda client: client.direct_send(text, thread_ids=[int(thread_id)]))
        self._changed(thread_id)
        return getattr(message, "id", None)

    def send_voice(self, thread_id: str, m4a: Path, waveform: Optional[List[float]]) -> Optional[str]:
        message = self._call(
            lambda client: client.direct_send_voice(m4a, thread_ids=[int(thread_id)], waveform=waveform)
        )
        self._changed(thread_id)
        return getattr(message, "id", None)

    def set_reaction(self, thread_id: str, item_id: str, emoji: str, on: bool) -> bool:
        def action(client: Client) -> bool:
            method = client.direct_send_reaction if on else client.direct_delete_reaction
            return bool(method(int(thread_id), int(item_id), emoji))

        result = self._call(action)
        self._changed(thread_id)
        return result

    def mark_seen(self, thread_id: str, item_id: str) -> bool:
        result = self._call(lambda client: bool(client.direct_message_seen(int(thread_id), int(item_id))))
        self._cache.drop(("inbox",))
        return result


def password_login(
    client: Client,
    username: str,
    password: str,
    ask_code: Callable[[str], str],
    totp_secret: Optional[str] = None,
) -> None:
    """Signs `client` in as Instagram's Android app does: password, then a two-factor code
    (from `totp_secret` or `ask_code`) and any code Instagram sends to confirm the sign-in."""
    client.challenge_code_handler = lambda _username, choice: ask_code(f"Code Instagram sent you ({choice}): ")
    try:
        client.login(username, password)
    except TwoFactorRequired:
        code = client.totp_generate_code(totp_secret) if totp_secret else ask_code("Two-factor code: ")
        client.login(username, password, verification_code=code.strip())


def login(
    config: Config,
    *,
    username: Optional[str] = None,
    password: Optional[str] = None,
    sessionid: Optional[str] = None,
    ask_code: Callable[[str], str] = input,
    totp_secret: Optional[str] = None,
    client_factory: Callable[[], Client] = Client,
) -> str:
    """Signs in and writes the session file; returns the username.

    A username and password make a session of the Android app the bridge
    emulates (Instagram may ask to confirm it in the app). A `sessionid` cookie
    from a browser is accepted too, but Instagram tends to end a browser session
    as soon as the app's API uses it."""
    signer = MediaSigner(config.bridge_key)
    service = Instagram(config, signer, client_factory=client_factory)
    client = service._new_client()
    try:
        if username and password:
            password_login(client, username, password, ask_code, totp_secret)
        elif sessionid:
            client.login_by_sessionid(sessionid)
        else:
            raise errors.login_required("Give a username and password (or a sessionid).")
    except BridgeError:
        raise
    except Exception as error:
        raise errors.from_instagram(error) from error
    service._dump(client)
    return str(getattr(client, "username", "") or client.user_id)
