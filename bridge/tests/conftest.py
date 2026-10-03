import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import fixtures  # noqa: E402
from lumen_ig_bridge.config import Config  # noqa: E402

KEY = "test-key-0123456789abcdefghijkl"


class FakeClient:
    """Stands in for instagrapi's Client: routes private_request to fixtures and records writes."""

    def __init__(self):
        self.calls = []
        self.user_id = None
        self.username = None
        self.fail_with = None
        self.responses = {
            "accounts/current_user/": fixtures.current_user,
            "clips/connected/": fixtures.reels_feed,
            "direct_v2/inbox/": fixtures.inbox,
        }

    # session
    def set_proxy(self, dsn):
        self.calls.append(("set_proxy", dsn))

    def set_locale(self, locale):
        self.calls.append(("set_locale", locale))

    def set_timezone_offset(self, seconds):
        self.calls.append(("set_timezone_offset", seconds))

    def load_settings(self, path):
        settings = json.loads(Path(path).read_text())
        self.user_id = int(settings["authorization_data"]["ds_user_id"])
        self.calls.append(("load_settings", str(path)))

    def dump_settings(self, path):
        Path(path).write_text(json.dumps({"authorization_data": {"ds_user_id": str(self.user_id)}}))
        self.calls.append(("dump_settings", str(path)))

    def login_by_sessionid(self, sessionid):
        assert len(sessionid) > 30
        self.user_id = int(sessionid.split("%")[0])
        self.username = "levi"
        self.calls.append(("login_by_sessionid",))

    # reads
    def private_request(self, endpoint, data=None, params=None, **kwargs):
        self.calls.append(("private_request", endpoint, params))
        if self.fail_with is not None:
            raise self.fail_with
        if endpoint.startswith("direct_v2/threads/"):
            return fixtures.thread_response(endpoint.split("/")[2])
        if endpoint.startswith("media/") and endpoint.endswith("/comments/"):
            return fixtures.comments()
        if endpoint.startswith("media/") and endpoint.endswith("/info/"):
            return fixtures.media_info()
        return self.responses[endpoint]()

    def media_pk_from_code(self, code):
        return "3101"

    def _direct_request_tracking_params(self):
        return {"tracking": "1"}

    # writes
    def _write(self, *call):
        self.calls.append(call)
        if self.fail_with is not None:
            raise self.fail_with
        return True

    def media_like(self, media_id):
        return self._write("media_like", media_id)

    def media_unlike(self, media_id):
        return self._write("media_unlike", media_id)

    def media_save(self, media_id):
        return self._write("media_save", media_id)

    def media_unsave(self, media_id):
        return self._write("media_unsave", media_id)

    def clip_seen(self, ids):
        return self._write("clip_seen", tuple(ids))

    def direct_media_share(self, media_id, thread_ids, media_type):
        return self._write("direct_media_share", media_id, tuple(thread_ids), media_type)

    def direct_send(self, text, thread_ids):
        self._write("direct_send", text, tuple(thread_ids))
        return type("Message", (), {"id": "9001"})()

    def direct_send_voice(self, path, thread_ids, waveform):
        self._write("direct_send_voice", Path(path).suffix, Path(path).stat().st_size > 0, tuple(thread_ids), len(waveform or []))
        return type("Message", (), {"id": "9002"})()

    def direct_send_reaction(self, thread_id, item_id, emoji):
        return self._write("direct_send_reaction", thread_id, item_id, emoji)

    def direct_delete_reaction(self, thread_id, item_id, emoji):
        return self._write("direct_delete_reaction", thread_id, item_id, emoji)

    def direct_message_seen(self, thread_id, item_id):
        return self._write("direct_message_seen", thread_id, item_id)


@pytest.fixture
def fake_client():
    return FakeClient()


@pytest.fixture
def config(tmp_path):
    return Config(bridge_key=KEY, session_file=tmp_path / "session.json", sessionid=f"{fixtures.VIEWER}%3Aabcdefghijklmnopqrstuvwxyz0123")


@pytest.fixture
def auth():
    return {"Authorization": f"Bearer {KEY}"}
