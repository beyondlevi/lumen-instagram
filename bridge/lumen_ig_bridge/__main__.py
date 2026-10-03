"""`python -m lumen_ig_bridge` runs the bridge; `python -m lumen_ig_bridge login` signs in."""

from __future__ import annotations

import argparse
import getpass
import logging
import sys

from . import config as config_module
from .errors import BridgeError


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="lumen_ig_bridge", description="Instagram bridge for Instagram for Lumen.")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("serve", help="run the bridge (the default)")
    login_parser = sub.add_parser("login", help="sign in to Instagram and write the session file")
    login_parser.add_argument("--sessionid", action="store_true", help="paste a browser sessionid cookie instead (Instagram often ends it)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    try:
        config = config_module.load()
    except config_module.ConfigError as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2

    if args.command == "login":
        from .instagram import login

        # IG_USERNAME, IG_PASSWORD and IG_TOTP_SECRET from the environment, else asked here.
        try:
            if args.sessionid:
                credentials = {"sessionid": getpass.getpass("sessionid cookie from a signed-in instagram.com: ").strip()}
            else:
                username = config.username or input("Instagram username: ").strip()
                password = config.password or getpass.getpass("Instagram password: ")
                credentials = {"username": username, "password": password, "totp_secret": config.totp_secret}
            if config.session_file.exists():
                config.session_file.unlink()
            username = login(config, ask_code=input, **credentials)
        except BridgeError as error:
            print(f"Sign-in failed ({error.code}): {error.message}", file=sys.stderr)
            return 1
        except (AssertionError, EOFError, KeyboardInterrupt) as error:
            print(f"Sign-in stopped: {error.__class__.__name__}", file=sys.stderr)
            return 1
        print(f"Signed in as {username}. Session saved to {config.session_file}.")
        return 0

    import uvicorn

    from .server import create_app

    uvicorn.run(create_app(config), host=config.host, port=config.port, proxy_headers=True, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
