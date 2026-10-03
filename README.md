# Instagram for Rokid Lumen

Instagram Reels and Direct on Rokid Lumen glasses, driven by the Neural Band: an
MRBD web app built on Meta's [UI Toolkit for Meta Ray-Ban Display](https://github.com/facebook/meta-ray-ban-display-ui-toolkit-web),
and a small bridge you run at home that talks to Instagram for it.

```
glasses: Instagram for Lumen (offline package, GeckoView)
   │  HTTPS, Authorization: Bearer <bridge key>
   ▼
your bridge (bridge/, Python + instagrapi), reachable through a tunnel
   │  Instagram's private API, with your session
   ▼
Instagram          (videos play straight from Instagram's CDN)
```

> Instagram's terms don't allow automated clients. This is for your own account,
> from your own home connection; expect Instagram to ask you to confirm a sign-in
> now and then. Nothing is posted or sent unless you do it on the glasses.

## What it does

- **Reels.** The Reels feed, one reel per page: swipe down for the next one, up for
  the previous. The 9:16 video sits in a column in the middle of the HUD (the black
  around it is see-through), with the author, the caption and the audio below it and
  the likes and comments in the margin. An index tap pauses it and brings up the
  position and **Like, Comments, Send, Save** and **Sound**; a middle tap resumes.
  Comments are read-only. **Send** shares the reel to a conversation.
- **Direct.** Swipe right for the inbox (unread conversations marked, refreshed
  every 30 s while it is shown). A conversation shows text, reels and posts someone
  sent (as thumbnails), voice messages, reactions and likes, refreshed every 6 s.
  An index tap on a message opens its menu: **Play** a reel, **View** a photo,
  **Listen** to or **Transcribe** a voice message, react with ❤️ 😂 😮 😢 👍, **Reply**.
  **Reply** opens Lumen's dictation; **Voice** records a voice message with the
  glasses' microphone (through the phone). A reel someone sent plays full screen
  with quick replies: a heart, a laugh, Reply and Send.
- **Notifications.** An Instagram notification forwarded from the phone offers this
  app; it opens the conversation the notification is about (by its title).
- **States.** Setup, a wrong bridge key, an ended Instagram session and Instagram's
  "confirm it's you" each have their own screen. Demo mode (`demo` set to
  `demo-captures`) runs on built-in content with no bridge.
- English and Portuguese, from the device's language.

## Set up

1. **Run the bridge** at home and expose it over HTTPS: see [bridge/README.md](bridge/README.md).
   It needs a `sessionid` cookie from a signed-in instagram.com and a key you choose.
2. **Install the package** on the glasses: from a release or `npm run package`, then
   `scripts/push-webapp.sh dist/lumen-instagram.mrbd.zip` from the Lumen repository,
   or the companion's **Apps, Add, Offline package**.
3. **In the companion**, *Apps*, *Instagram*: set **Bridge URL** (the tunnel's
   `https://` address) and **Bridge key** (a secret: it stays on the glasses).

## Development

```sh
npm ci
npm run dev                       # http://localhost:5173/?bridge.url=…&bridge.key=…  (or ?demo=demo-captures)
npm test                          # unit tests (vitest)
npm run package                   # dist/lumen-instagram.mrbd.zip
npm run test:e2e                  # keyboard E2E, Chromium + Firefox, against the real bridge
npm run test:bridge               # the bridge's tests (pytest)
```

In a regular browser the settings come from `?bridge.url=…&bridge.key=…` (kept in
localStorage and removed from the address). Arrow keys, Enter and Escape stand in for
the band's swipes, index tap and middle tap.

The E2E tests (`tests/e2e/run.mjs`) run the built app against the bridge itself
(`bridge/tests/e2e_server.py`: the real FastAPI app in front of a fake Instagram
client) and a local stand-in for Instagram's CDN, so the app/bridge contract,
CORS, the key, the signed image links and the voice upload (ffmpeg) are all
exercised. They need the bridge's Python dependencies (`pip install './bridge[test]'`,
or `BRIDGE_PYTHON=/path/to/python`) and ffmpeg.

Layout:

| Path | |
| --- | --- |
| `src/api/` | The bridge's API (client, types). |
| `src/state/` | The session, the Reels and Direct stores, the voice player. |
| `src/pages/`, `src/components/` | The screens; `ReelPlayer` and `MessageBubble` are the two big ones. |
| `src/demo/` | Demo mode's content and media (`npm run media` regenerates the media). |
| `bridge/` | The bridge: [bridge/README.md](bridge/README.md). |

## Limits

- **The bridge is the risky part.** It uses Instagram's private API through
  [instagrapi](https://github.com/subzeroid/instagrapi); Instagram changes it without
  notice and may challenge or limit an account that uses it. Run it from home, not
  from a server, and keep the polling as it is.
- No real-time push: the inbox and the open conversation are polled. New messages
  also reach the glasses as phone notifications.
- Comments are read-only; no stories, no posting, no new conversations.
- Not tested yet against a real Instagram account or on the glasses: everything above
  is tested against the fake client and in desktop Chromium and Firefox.
