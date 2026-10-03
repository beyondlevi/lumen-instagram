"""Errors the bridge answers with, and how instagrapi's exceptions map to them.

Every error is `{"error": {"code", "message", "retryAfter"?}}`. The app keys its
screens on `code`:

- `bad_key` (401): the app's bridge key doesn't match.
- `login_required` (401): no Instagram session, or Instagram ended it.
- `challenge` (409): Instagram wants the account owner to confirm a sign-in.
- `blocked` (403): Instagram refused the action (spam or feedback block).
- `rate_limited` (429): Instagram asked to slow down; `retryAfter` in seconds.
- `not_found` (404), `bad_request` (400), `too_large` (413).
- `network` (503): the bridge couldn't reach Instagram.
- `instagram` (502): any other Instagram error.
"""

from __future__ import annotations

from typing import Optional

from instagrapi import exceptions as ig

RATE_LIMIT_RETRY_SECONDS = 300


class BridgeError(Exception):
    def __init__(self, status: int, code: str, message: str, retry_after: Optional[int] = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_after = retry_after

    def body(self) -> dict:
        error = {"code": self.code, "message": self.message}
        if self.retry_after is not None:
            error["retryAfter"] = self.retry_after
        return {"error": error}


def login_required(message: str = "Instagram needs a new session.") -> BridgeError:
    return BridgeError(401, "login_required", message)


def from_instagram(error: Exception) -> BridgeError:
    """The BridgeError for an exception raised while talking to Instagram."""
    if isinstance(error, BridgeError):
        return error
    text = str(error) or error.__class__.__name__
    challenge = (ig.ChallengeError, ig.CaptchaChallengeRequired, ig.TwoFactorRequired)
    if isinstance(error, challenge):
        return BridgeError(409, "challenge", "Instagram wants you to confirm this sign-in in the Instagram app.")
    if isinstance(error, (ig.LoginRequired, ig.ClientLoginRequired, ig.ClientUnauthorizedError,
                          ig.ReloginAttemptExceeded, ig.BadCredentials, ig.BadPassword)):
        return login_required()
    if isinstance(error, (ig.FeedbackRequired, ig.SentryBlock, ig.AccountSuspended, ig.ProxyAddressIsBlocked)):
        return BridgeError(403, "blocked", f"Instagram refused this action: {text}")
    if isinstance(error, (ig.PleaseWaitFewMinutes, ig.RateLimitError, ig.ClientThrottledError)):
        return BridgeError(429, "rate_limited", "Instagram asked to slow down.", RATE_LIMIT_RETRY_SECONDS)
    if isinstance(error, (ig.NotFoundError, ig.ClientNotFoundError, ig.MediaUnavailable, ig.InvalidMediaId)):
        return BridgeError(404, "not_found", "Instagram says this no longer exists.")
    if isinstance(error, ig.CommentsDisabled):
        return BridgeError(403, "comments_disabled", "Comments are off for this reel.")
    if isinstance(error, (ig.ClientConnectionError, ig.ClientRequestTimeout, ig.ClientIncompleteReadError,
                          ConnectionError, TimeoutError)):
        return BridgeError(503, "network", "The bridge couldn't reach Instagram.")
    if isinstance(error, ig.ClientForbiddenError):
        return BridgeError(403, "blocked", f"Instagram refused this request: {text}")
    return BridgeError(502, "instagram", f"Instagram error: {text[:200]}")
