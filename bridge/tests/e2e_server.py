"""The real bridge, in front of the fake Instagram client, for the app's E2E tests.

    python bridge/tests/e2e_server.py --port 8790 --media http://127.0.0.1:8791

Media URLs in the fixtures point at `--media` (a local stand-in for the CDN that
the test runner serves). Test-only routes steer it:

- `GET /__test/calls`: what the fake client was asked to do, as JSON.
- `POST /__test/reset`: forget the calls and any failure.
- `POST /__test/fail?code=login_required|challenge|network|none`: make every
  Instagram call fail that way (`none` clears it).
"""

import argparse
import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8790)
    parser.add_argument("--media", default="http://127.0.0.1:8791")
    parser.add_argument("--key", default="e2e-bridge-key-0123456789abcdef")
    args = parser.parse_args()

    os.environ["LUMEN_E2E_CDN"] = f"{args.media}/cdn"
    os.environ["LUMEN_E2E_VIDEO_CDN"] = f"{args.media}/video"
    sys.path.insert(0, str(HERE.parent))
    sys.path.insert(0, str(HERE))

    import uvicorn
    from fastapi import Request
    from instagrapi import exceptions as ig

    import fixtures  # noqa: F401  (reads the CDN variables above)
    from conftest import FakeClient
    from lumen_ig_bridge.config import Config
    from lumen_ig_bridge.instagram import Instagram
    from lumen_ig_bridge.media import MediaSigner
    from lumen_ig_bridge.server import create_app

    client = FakeClient()
    session = Path(tempfile.mkdtemp(prefix="lumen-ig-e2e-")) / "session.json"
    config = Config(bridge_key=args.key, session_file=session, sessionid=f"{fixtures.VIEWER}%3Ae2e-session-abcdefghijklmnop")
    signer = MediaSigner(args.key, extra_origins=[args.media])
    app = create_app(config, Instagram(config, signer, client_factory=lambda: client), signer)

    failures = {
        "login_required": lambda: ig.LoginRequired("login_required"),
        "challenge": lambda: ig.ChallengeRequired("challenge_required"),
        "network": lambda: ig.ClientConnectionError("down"),
    }

    @app.get("/__test/calls")
    def calls():
        return [[str(part) for part in call] for call in client.calls if call[0] != "private_request"] + [
            ["read", call[1]] for call in client.calls if call[0] == "private_request"
        ]

    @app.post("/__test/reset")
    def reset():
        client.calls.clear()
        client.fail_with = None
        return {"ok": True}

    @app.post("/__test/fail")
    def fail(request: Request):
        code = request.query_params.get("code", "none")
        client.fail_with = failures[code]() if code in failures else None
        return {"ok": True}

    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
