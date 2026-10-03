import json
import shutil
import subprocess

import httpx
import pytest
from fastapi.testclient import TestClient
from instagrapi import exceptions as ig

import fixtures
from conftest import KEY
from lumen_ig_bridge.instagram import Instagram
from lumen_ig_bridge.media import MediaSigner
from lumen_ig_bridge.server import create_app

THREAD = "340282366841710300949128000000000001"


def make(config, fake_client, media_transport=None):
    signer = MediaSigner(config.bridge_key)
    service = Instagram(config, signer, client_factory=lambda: fake_client)
    return TestClient(create_app(config, service, signer, media_transport=media_transport))


def test_health_needs_no_key(config, fake_client):
    response = make(config, fake_client).get("/v1/health")
    assert response.status_code == 200 and response.json()["ok"] is True


@pytest.mark.parametrize("header", [None, "Bearer wrong-key", f"Basic {KEY}", f"Bearer {KEY}x"])
def test_routes_need_the_key(config, fake_client, header):
    headers = {"Authorization": header} if header else {}
    response = make(config, fake_client).get("/v1/reels", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "bad_key"
    assert not any(call[0] == "private_request" for call in fake_client.calls)


def test_cors_preflight_from_the_glasses_origin(config, fake_client):
    response = make(config, fake_client).options("/v1/threads", headers={
        "Origin": "http://127.0.0.1:47123",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] in ("*", "http://127.0.0.1:47123")
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_first_call_signs_in_with_the_sessionid_and_saves_the_session(config, fake_client, auth):
    client = make(config, fake_client)
    response = client.get("/v1/me", headers=auth)
    assert response.status_code == 200
    assert response.json()["user"]["username"] == "levi"
    assert ("login_by_sessionid",) in fake_client.calls
    assert config.session_file.exists()
    assert oct(config.session_file.stat().st_mode & 0o777) == "0o600"


def test_session_file_wins_over_the_sessionid(config, fake_client, auth):
    config.session_file.write_text(json.dumps({"authorization_data": {"ds_user_id": "1001"}}))
    make(config, fake_client).get("/v1/reels", headers=auth)
    assert ("login_by_sessionid",) not in fake_client.calls
    assert ("load_settings", str(config.session_file)) in fake_client.calls


def test_no_session_at_all_is_login_required(tmp_path, fake_client, auth):
    from lumen_ig_bridge.config import Config

    config = Config(bridge_key=KEY, session_file=tmp_path / "none.json")
    response = make(config, fake_client).get("/v1/threads", headers=auth)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "login_required"


def test_reels_and_comments(config, fake_client, auth):
    client = make(config, fake_client)
    reels = client.get("/v1/reels", params={"cursor": "cursor-2"}, headers=auth).json()
    assert len(reels["items"]) == 2
    assert ("private_request", "clips/connected/", {"max_id": "cursor-2"}) in fake_client.calls
    comments = client.get("/v1/reels/3100_2001/comments", headers=auth).json()
    assert comments["commentCount"] == 86
    reel = client.get("/v1/reels/code/DBloom00001", headers=auth).json()["reel"]
    assert reel["id"] == "3101_2004"


def test_reel_writes(config, fake_client, auth):
    client = make(config, fake_client)
    assert client.post("/v1/reels/3100_2001/like", headers=auth).json() == {"liked": True}
    assert client.delete("/v1/reels/3100_2001/like", headers=auth).json() == {"liked": False}
    assert client.post("/v1/reels/3100_2001/save", headers=auth).json() == {"saved": True}
    assert client.delete("/v1/reels/3100_2001/save", headers=auth).json() == {"saved": False}
    assert client.post("/v1/reels/seen", json={"ids": ["3100_2001", "bad id"]}, headers=auth).status_code == 200
    share = client.post("/v1/reels/3100_2001/share", json={"threadIds": [THREAD]}, headers=auth)
    assert share.status_code == 200
    names = [call[0] for call in fake_client.calls]
    for name in ("media_like", "media_unlike", "media_save", "media_unsave", "clip_seen", "direct_media_share"):
        assert name in names
    assert ("clip_seen", ("3100_2001",)) in fake_client.calls
    assert ("direct_media_share", "3100_2001", (int(THREAD),), "video") in fake_client.calls


@pytest.mark.parametrize("path", ["/v1/reels/abc/like", "/v1/reels/1_2_3/like", "/v1/reels/code/x!/"])
def test_bad_ids_are_refused(config, fake_client, auth, path):
    response = make(config, fake_client).post(path, headers=auth)
    assert response.status_code in (400, 404, 405)


def test_inbox_and_thread(config, fake_client, auth):
    client = make(config, fake_client)
    inbox = client.get("/v1/threads", headers=auth).json()
    assert [t["title"] for t in inbox["items"]] == ["ana.costa", "Climbing crew", "joao.p, studio.bloom"]
    page = client.get(f"/v1/threads/{THREAD}", headers=auth).json()
    assert page["thread"]["id"] == THREAD
    assert page["messages"][-1]["kind"] == "voice"


def test_inbox_is_cached_briefly_and_writes_clear_it(config, fake_client, auth):
    client = make(config, fake_client)
    client.get("/v1/threads", headers=auth)
    client.get("/v1/threads", headers=auth)
    inbox_calls = [c for c in fake_client.calls if c[0] == "private_request" and c[1] == "direct_v2/inbox/"]
    assert len(inbox_calls) == 1
    client.post(f"/v1/threads/{THREAD}/text", json={"text": "hi"}, headers=auth)
    client.get("/v1/threads", headers=auth)
    inbox_calls = [c for c in fake_client.calls if c[0] == "private_request" and c[1] == "direct_v2/inbox/"]
    assert len(inbox_calls) == 2


def test_direct_writes(config, fake_client, auth):
    client = make(config, fake_client)
    sent = client.post(f"/v1/threads/{THREAD}/text", json={"text": "  Saturday works  "}, headers=auth)
    assert sent.json() == {"ok": True, "id": "9001"}
    assert ("direct_send", "Saturday works", (int(THREAD),)) in fake_client.calls
    assert client.post(f"/v1/threads/{THREAD}/text", json={"text": "   "}, headers=auth).status_code == 400
    assert client.post(f"/v1/threads/{THREAD}/text", json={"text": "x" * 1001}, headers=auth).status_code == 400
    react = client.post(f"/v1/threads/{THREAD}/items/5003/reaction", json={"emoji": "😂"}, headers=auth)
    assert react.status_code == 200
    client.post(f"/v1/threads/{THREAD}/items/5003/reaction", json={"emoji": "😂", "remove": True}, headers=auth)
    assert ("direct_send_reaction", int(THREAD), 5003, "😂") in fake_client.calls
    assert ("direct_delete_reaction", int(THREAD), 5003, "😂") in fake_client.calls
    assert client.post(f"/v1/threads/{THREAD}/seen", json={"itemId": "5005"}, headers=auth).json() == {"ok": True}
    assert ("direct_message_seen", int(THREAD), 5005) in fake_client.calls


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_voice_note_is_converted_to_m4a(config, fake_client, auth, tmp_path):
    ogg = tmp_path / "note.ogg"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
                    "-ac", "1", "-ar", "16000", "-c:a", "libopus", str(ogg)], check=True)
    client = make(config, fake_client)
    response = client.post(f"/v1/threads/{THREAD}/voice", headers=auth,
                           files={"audio": ("note.ogg", ogg.read_bytes(), "audio/ogg")},
                           data={"levels": json.dumps([0.1, 0.4, 0.2, 0.0, 0.3])})
    assert response.status_code == 200, response.text
    assert response.json() == {"ok": True, "id": "9002"}
    assert ("direct_send_voice", ".m4a", True, (int(THREAD),), 70) in fake_client.calls


def test_voice_note_that_is_not_audio(config, fake_client, auth):
    if shutil.which("ffmpeg") is None:
        pytest.skip("needs ffmpeg")
    response = make(config, fake_client).post(f"/v1/threads/{THREAD}/voice", headers=auth,
                                              files={"audio": ("x.ogg", b"not audio at all", "audio/ogg")})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "bad_audio"


@pytest.mark.parametrize("error,status,code", [
    (ig.ChallengeRequired("challenge_required"), 409, "challenge"),
    (ig.LoginRequired("login_required"), 401, "login_required"),
    (ig.PleaseWaitFewMinutes("please wait"), 429, "rate_limited"),
    (ig.FeedbackRequired("feedback_required"), 403, "blocked"),
    (ig.ClientNotFoundError("404"), 404, "not_found"),
    (ig.ClientConnectionError("down"), 503, "network"),
    (ig.ClientError("weird"), 502, "instagram"),
])
def test_instagram_errors_map_to_codes(config, fake_client, auth, error, status, code):
    client = make(config, fake_client)
    client.get("/v1/me", headers=auth)  # signs in first
    fake_client.fail_with = error
    response = client.get("/v1/reels", headers=auth)
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    if code == "rate_limited":
        assert response.headers["retry-after"] == "300"


class _Body(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b"ab"
        yield b"cd"


def test_media_proxy_streams_signed_cdn_links_only(config, fake_client):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["range"] = request.headers.get("range")
        return httpx.Response(206, headers={"content-type": "video/mp4", "content-range": "bytes 0-3/10",
                                            "accept-ranges": "bytes", "set-cookie": "no=1"}, stream=_Body())

    client = make(config, fake_client, media_transport=httpx.MockTransport(handler))
    signer = MediaSigner(KEY)
    url = f"{fixtures.CDN}/v/t51/a.mp4?x=1&y=2"
    path = signer.proxy(url)
    response = client.get(path, headers={"Range": "bytes=0-3"})
    assert response.status_code == 206
    assert response.content == b"abcd"
    assert seen == {"url": url, "range": "bytes=0-3"}
    assert response.headers["cross-origin-resource-policy"] == "cross-origin"
    assert "set-cookie" not in response.headers
    assert client.get(path[:-2] + "AA").status_code == 404
    assert client.get("/v1/m/" + "aHR0cHM6Ly9ldmlsLmNvbS94").status_code == 404
    assert signer.proxy("https://evil.example.com/x.jpg") is None
    assert signer.proxy("http://scontent.cdninstagram.com/x.jpg") is None
