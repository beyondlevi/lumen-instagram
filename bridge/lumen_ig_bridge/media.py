"""Signed media links and the media proxy.

The app shows images with `<img src>`, which can't carry the bridge key, so each
CDN URL the bridge hands out is wrapped in a path signed with a secret derived
from the key: `/v1/m/<url, base64url>.<signature>`. The proxy only follows
signed paths to Instagram's CDN hosts, so it can't be used as an open proxy.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Optional
from urllib.parse import urlsplit

MEDIA_PREFIX = "/v1/m/"
ALLOWED_HOST_SUFFIXES = (".cdninstagram.com", ".fbcdn.net")
SIGNATURE_BYTES = 16


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def allowed_url(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(host.endswith(suffix) for suffix in ALLOWED_HOST_SUFFIXES)


class MediaSigner:
    def __init__(self, bridge_key: str):
        self._secret = hmac.new(bridge_key.encode("utf-8"), b"lumen-ig-bridge/media", hashlib.sha256).digest()

    def _signature(self, url: str) -> str:
        digest = hmac.new(self._secret, url.encode("utf-8"), hashlib.sha256).digest()
        return _b64encode(digest[:SIGNATURE_BYTES])

    def proxy(self, url: Optional[str]) -> Optional[str]:
        """The bridge path for a CDN URL (relative to the bridge), or None."""
        if not url or not allowed_url(url):
            return None
        return f"{MEDIA_PREFIX}{_b64encode(url.encode('utf-8'))}.{self._signature(url)}"

    def resolve(self, token: str) -> Optional[str]:
        """The CDN URL behind a signed token, or None when it's forged or not a CDN URL."""
        encoded, _, signature = token.rpartition(".")
        if not encoded or not signature:
            return None
        try:
            url = _b64decode(encoded).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return None
        if not hmac.compare_digest(signature, self._signature(url)):
            return None
        return url if allowed_url(url) else None
