"""Bridge settings, from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

MIN_KEY_LENGTH = 24


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Config:
    #: What the app sends as `Authorization: Bearer <key>`; also signs media links.
    bridge_key: str
    #: The instagrapi session (device, cookies), kept between restarts.
    session_file: Path
    #: A `sessionid` cookie from a signed-in instagram.com, used once when there is no session file.
    sessionid: Optional[str] = None
    #: Optional proxy for every Instagram request (http://, https:// or socks5://).
    proxy: Optional[str] = None
    #: Instagram's locale and time zone for this device (e.g. pt_BR, -10800).
    locale: Optional[str] = None
    timezone_offset: Optional[int] = None
    host: str = "127.0.0.1"
    port: int = 8787


def load(env: Mapping[str, str] = os.environ) -> Config:
    key = (env.get("BRIDGE_KEY") or "").strip()
    if len(key) < MIN_KEY_LENGTH:
        raise ConfigError(
            f"BRIDGE_KEY must be at least {MIN_KEY_LENGTH} characters (try: python -c "
            "'import secrets; print(secrets.token_urlsafe(32))')"
        )
    offset = (env.get("IG_TIMEZONE_OFFSET") or "").strip()
    try:
        timezone_offset = int(offset) if offset else None
    except ValueError as error:
        raise ConfigError("IG_TIMEZONE_OFFSET must be a number of seconds, e.g. -10800") from error
    port = (env.get("BRIDGE_PORT") or "8787").strip()
    try:
        port_number = int(port)
    except ValueError as error:
        raise ConfigError("BRIDGE_PORT must be a number") from error
    return Config(
        bridge_key=key,
        session_file=Path(env.get("IG_SESSION_FILE") or "data/session.json"),
        sessionid=(env.get("IG_SESSIONID") or "").strip() or None,
        proxy=(env.get("IG_PROXY") or "").strip() or None,
        locale=(env.get("IG_LOCALE") or "").strip() or None,
        timezone_offset=timezone_offset,
        host=(env.get("BRIDGE_HOST") or "127.0.0.1").strip(),
        port=port_number,
    )
