# Lumen Instagram bridge

The small server Instagram for Lumen talks to. It holds your Instagram session and
speaks Instagram's private API (the one the Android app uses) through
[instagrapi](https://github.com/subzeroid/instagrapi), and gives the glasses a
plain JSON API: the Reels feed, likes, saves, comments, sharing a reel, the Direct
inbox, conversations, text and voice messages, reactions and read marks.

Why a bridge: a web app can't call Instagram itself. Instagram's API sends no CORS
headers, it needs the session cookie a browser won't let a page set, and its CDN
won't show images on another site (`Cross-Origin-Resource-Policy: same-origin`).

> Instagram's terms don't allow automated clients. Use it with your own account,
> from your home connection, and expect Instagram to ask you to confirm a sign-in
> now and then. The bridge never posts or sends anything by itself: every write
> is something you did on the glasses.

## Run it

1. **A key** for the app: `python -c 'import secrets; print(secrets.token_urlsafe(32))'`.
2. **Your Instagram account**: its username and password. The bridge signs in as
   Instagram's Android app does, once, and keeps that session. Instagram may ask
   for your two-factor code, send a code by email or SMS, or ask *Was this you?* in
   the Instagram app: approve it. (A `sessionid` cookie copied from a browser does
   not work for long: Instagram ends a browser session as soon as the app's API
   uses it, and may sign the browser out too.)
3. **Start the bridge** on a computer at home (it needs `ffmpeg` for voice notes):

   ```sh
   cd bridge
   python -m venv .venv && . .venv/bin/activate
   pip install .
   export BRIDGE_KEY='<the key>'
   export IG_LOCALE=pt_BR IG_TIMEZONE_OFFSET=-10800   # your language and time zone
   python -m lumen_ig_bridge login                    # asks the username, password and codes; writes data/session.json
   python -m lumen_ig_bridge                          # listens on 127.0.0.1:8787
   ```

   Or with Docker:

   ```sh
   docker build -t lumen-ig-bridge bridge
   docker run -d --name lumen-ig-bridge --restart unless-stopped -p 127.0.0.1:8787:8787 \
     -e BRIDGE_KEY='<the key>' -e IG_USERNAME='<username>' -e IG_PASSWORD='<password>' \
     -e IG_LOCALE=pt_BR -e IG_TIMEZONE_OFFSET=-10800 \
     -v lumen-ig-data:/data lumen-ig-bridge
   ```

   `IG_USERNAME` and `IG_PASSWORD` are used once, when there is no session file yet
   (add `IG_TOTP_SECRET`, the authenticator's secret, for two-factor). When Instagram
   asks for a code, run `docker exec -it lumen-ig-bridge python -m lumen_ig_bridge login`.

   On a Mac or Linux box, `scripts/start.sh` (re)starts the bridge and a Cloudflare
   quick tunnel in the background, reading `.env`, and prints the tunnel's address.
4. **Make it reachable from the glasses** over HTTPS. The glasses reach the
   internet through Wi-Fi or the phone, not your home network, so use a tunnel:
   `ngrok http 8787`, `cloudflared tunnel --url http://127.0.0.1:8787` or
   Tailscale Funnel.
5. **On the phone**, in Rokid Lumen, *Apps*, *Instagram*: set *Bridge URL* to the
   tunnel's `https://` address and *Bridge key* to the key.

Check it: `curl https://<tunnel>/v1/health`, then
`curl -H "Authorization: Bearer <key>" https://<tunnel>/v1/me`.

## Settings

| Variable | |
| --- | --- |
| `BRIDGE_KEY` | Required, 24 characters or more. The app sends it as `Authorization: Bearer`; it also signs media links. |
| `IG_USERNAME`, `IG_PASSWORD` | Used once, when there is no session file: signs in as the Android app. `login` asks for them when they are not set. |
| `IG_TOTP_SECRET` | The authenticator app's secret, for two-factor codes without asking. |
| `IG_SESSIONID` | A browser `sessionid` cookie, used when there is no session file and no password. Instagram usually ends it within seconds. |
| `IG_SESSION_FILE` | The instagrapi session (device ids, cookies). Default `data/session.json`, written with mode 600. Replace it while the bridge runs and the next request uses it. |
| `IG_PROXY` | A proxy for every Instagram request (`http://`, `https://`, `socks5://`). |
| `IG_LOCALE`, `IG_TIMEZONE_OFFSET` | What the device tells Instagram, e.g. `pt_BR` and `-10800`. |
| `BRIDGE_HOST`, `BRIDGE_PORT` | Default `127.0.0.1` and `8787` (`0.0.0.0` in Docker). |

## When Instagram ends the session

The app shows *Sign in on your bridge* (`login_required`) or *Confirm it's you*
(`challenge`). For a challenge, open Instagram on your phone and approve the sign-in.
If it keeps failing, run `python -m lumen_ig_bridge login` again: it starts a new
session (and replaces the session file).

## API

All routes but `/v1/health` and media links need `Authorization: Bearer <key>`.
Times are epoch milliseconds. Image links (`/v1/m/…`) are relative to the bridge;
video and voice links point straight at Instagram's CDN, with a `…ProxyUrl`
fallback through the bridge.

| Route | |
| --- | --- |
| `GET /v1/health` | `{ok, version}` |
| `GET /v1/me` | `{user}` |
| `GET /v1/reels?cursor=` | The Reels feed: `{items: Reel[], nextCursor}` (ads and photos left out). |
| `GET /v1/reels/code/{code}` | `{reel}`: a reel by its shortcode (reels shared in Direct). |
| `POST`, `DELETE /v1/reels/{id}/like` | Like or unlike. |
| `POST`, `DELETE /v1/reels/{id}/save` | Save or unsave. |
| `POST /v1/reels/seen` | `{ids}`: marks reels as watched. |
| `GET /v1/reels/{id}/comments?cursor=` | `{items: Comment[], nextCursor, commentCount, commentsDisabled}` |
| `POST /v1/reels/{id}/share` | `{threadIds}`: sends the reel to conversations (up to 5). |
| `GET /v1/threads?cursor=` | The inbox: `{items: Thread[], nextCursor}` |
| `GET /v1/threads/{id}?cursor=` | `{thread, messages (oldest first), olderCursor}` |
| `POST /v1/threads/{id}/text` | `{text}` (up to 1000 characters). |
| `POST /v1/threads/{id}/voice` | Multipart: `audio` (any format ffmpeg reads, up to 5 MB) and `levels` (JSON array of 0..1 input levels for the waveform). |
| `POST /v1/threads/{id}/items/{itemId}/reaction` | `{emoji, remove?}` |
| `POST /v1/threads/{id}/seen` | `{itemId}`: marks the conversation read up to that message. |
| `GET /v1/m/{token}` | A signed media link (supports `Range`). |

Errors are `{error: {code, message, retryAfter?}}` with `bad_key`, `login_required`,
`challenge`, `blocked`, `rate_limited`, `not_found`, `bad_request`, `bad_audio`,
`too_large`, `network` or `instagram`.

## Tests

```sh
pip install '.[test]' && pytest
```

The tests run the whole API against a fake Instagram client and recorded-shape
payloads (`tests/fixtures.py`); they never reach Instagram.
