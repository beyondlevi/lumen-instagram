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
    sub.add_parser("login", help="sign in with a sessionid cookie and write the session file")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    try:
        config = config_module.load()
    except config_module.ConfigError as error:
        print(f"Configuration error: {error}", file=sys.stderr)
        return 2

    if args.command == "login":
        from .instagram import login

        sessionid = getpass.getpass("sessionid cookie from a signed-in instagram.com: ").strip()
        try:
            username = login(config, sessionid)
        except BridgeError as error:
            print(f"Sign-in failed ({error.code}): {error.message}", file=sys.stderr)
            return 1
        except AssertionError:
            print("That doesn't look like a sessionid cookie.", file=sys.stderr)
            return 1
        print(f"Signed in as {username}. Session saved to {config.session_file}.")
        return 0

    import uvicorn

    from .server import create_app

    uvicorn.run(create_app(config), host=config.host, port=config.port, proxy_headers=True, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
