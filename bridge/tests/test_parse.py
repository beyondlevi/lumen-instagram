import fixtures
from lumen_ig_bridge import parse
from lumen_ig_bridge.media import MediaSigner

from conftest import KEY

signer = MediaSigner(KEY)
proxy = signer.proxy


def test_reels_page_keeps_videos_drops_ads_and_duplicates():
    page = parse.reels_page(fixtures.reels_feed(), proxy)
    assert [reel["code"] for reel in page["items"]] == ["DMaya000001", "DBloom00001"]
    assert page["nextCursor"] == "cursor-2"
    first = page["items"][0]
    assert first["id"] == "3100_2001"
    assert first["user"]["username"] == "maya.outdoors"
    assert first["caption"] == "First snow on the ridge this morning."
    assert first["takenAt"] == 1790990000000
    assert first["durationSec"] == 14.6
    assert first["likeCount"] == 1200 and first["commentCount"] == 34
    assert first["audioTitle"] == "Original audio"
    assert page["items"][1]["audioTitle"] == "Aurora · Spring"


def test_reel_video_is_the_smallest_with_a_480_short_side_and_direct():
    reel = parse.reel(fixtures.clip_media("1", fixtures.MAYA, "DCode000001"), proxy)
    assert reel["videoUrl"].endswith("DCode000001_720.mp4?efg=1")
    assert reel["width"] == 720 and reel["height"] == 1280
    assert signer.resolve(reel["videoProxyUrl"].removeprefix("/v1/m/")) == reel["videoUrl"]


def test_reel_images_are_proxied():
    reel = parse.reel(fixtures.clip_media("1", fixtures.MAYA, "DCode000001"), proxy)
    assert reel["posterUrl"].startswith("/v1/m/")
    assert signer.resolve(reel["posterUrl"].removeprefix("/v1/m/")).endswith("DCode000001_640.jpg")
    assert signer.resolve(reel["user"]["avatarUrl"].removeprefix("/v1/m/")).endswith("maya.outdoors.jpg?stp=dst-jpg_s150x150")


def test_reel_hidden_likes_and_saved():
    media = fixtures.clip_media("1", fixtures.MAYA, "DCode000001", liked=True, saved=True, hidden=True)
    reel = parse.reel(media, proxy)
    assert reel["likeCount"] is None
    assert reel["liked"] and reel["saved"]


def test_photo_is_not_a_reel():
    media = fixtures.clip_media("1", fixtures.MAYA, "DCode000001")
    media["video_versions"] = []
    assert parse.reel(media, proxy) is None


def test_last_page_has_no_cursor():
    feed = fixtures.reels_feed()
    feed["paging_info"] = {"max_id": "x", "more_available": False}
    assert parse.reels_page(feed, proxy)["nextCursor"] is None


def test_comments_page():
    page = parse.comments_page(fixtures.comments(), proxy)
    assert [c["id"] for c in page["items"]] == ["4001", "4002"]
    assert page["items"][0]["createdAt"] == 1790993600000
    assert page["items"][1]["createdAt"] == 1790994000000
    assert page["nextCursor"] == "c-next"
    assert page["commentCount"] == 86


def test_inbox_threads_titles_previews_and_unread():
    page = parse.inbox_page(fixtures.inbox(), fixtures.VIEWER, proxy)
    assert page["nextCursor"] == "inbox-older"
    ana, crew, untitled = page["items"]
    assert ana["title"] == "ana.costa" and not ana["isGroup"]
    assert ana["unread"] is True
    assert ana["lastMessage"]["kind"] == "voice"
    assert ana["lastMessage"]["senderName"] == "ana.costa"
    assert ana["lastActivityAt"] == 1790999000000
    assert crew["unread"] is False and crew["isGroup"]
    assert crew["lastMessage"]["text"] == "Saturday, 7 am at the gate?"
    assert crew["lastActivityAt"] == 1790980000000
    assert untitled["title"] == "joao.p, studio.bloom"
    assert untitled["unread"] is True
    assert untitled["lastMessage"]["kind"] == "post"


def test_thread_page_messages_oldest_first_with_every_kind():
    page = parse.thread_page(fixtures.thread_response(), fixtures.VIEWER, proxy)
    messages = page["messages"]
    assert page["olderCursor"] == "older-1"
    assert [m["id"] for m in messages] == ["4997", "4998", "4999", "5000", "5001", "5002", "5003", "5004", "5005"]
    kinds = {m["id"]: m["kind"] for m in messages}
    assert kinds == {
        "4997": "unsupported", "4998": "ephemeral", "4999": "event", "5000": "like", "5001": "reel",
        "5002": "reel", "5003": "text", "5004": "text", "5005": "voice",
    }
    by_id = {m["id"]: m for m in messages}
    assert by_id["4997"]["itemType"] == "brand_new_type"
    assert by_id["5000"]["fromMe"] and by_id["5000"]["senderName"] is None
    assert by_id["5003"]["senderName"] == "ana.costa"
    assert by_id["5001"]["reel"]["playable"] and by_id["5001"]["reel"]["code"] == "DMaya000001"
    shared = by_id["5002"]["reel"]
    assert shared["code"] == "DBloom00001" and shared["author"] == "studio.bloom"
    assert shared["thumbnailUrl"].startswith("/v1/m/") and shared["id"] is None
    assert by_id["5004"]["reactions"] == [{"emoji": "❤️", "count": 1, "mine": False}]
    voice = by_id["5005"]["voice"]
    assert voice["durationSec"] == 8.4
    assert voice["audioUrl"].startswith("https://") and voice["audioProxyUrl"].startswith("/v1/m/")
    assert by_id["5005"]["timestamp"] == 1790999000000


def test_reactions_count_and_mine():
    reactions = parse._reactions({"emojis": [
        {"emoji": "😂", "sender_id": 1001}, {"emoji": "😂", "sender_id": 2002}, {"emoji": "🔥", "sender_id": 2002},
    ], "likes": [{"sender_id": 1001}]}, "1001")
    assert {"emoji": "😂", "count": 2, "mine": True} in reactions
    assert {"emoji": "🔥", "count": 1, "mine": False} in reactions
    assert {"emoji": "❤️", "count": 1, "mine": True} in reactions


def test_broken_items_do_not_break_a_thread():
    raw = fixtures.thread_response()
    raw["thread"]["items"] += [None, "x", {"item_id": "1", "item_type": "clip", "clip": "nonsense"},
                               {"item_id": "2", "item_type": "voice_media"}, {"item_id": "3", "item_type": "xma_clip"}]
    page = parse.thread_page(raw, fixtures.VIEWER, proxy)
    assert len(page["messages"]) == 12


def test_shortcode_from_url():
    assert parse.shortcode_from_url("https://www.instagram.com/reel/DAbc_-123/?igsh=1") == "DAbc_-123"
    assert parse.shortcode_from_url("https://www.instagram.com/p/Cxyz12345/") == "Cxyz12345"
    assert parse.shortcode_from_url("instagram://direct-notes?user_id=1") is None


def test_micros_to_ms_accepts_any_unit():
    assert parse.micros_to_ms(1790999000000000) == 1790999000000
    assert parse.micros_to_ms("1790999000000000") == 1790999000000
    assert parse.micros_to_ms(1790999000000) == 1790999000000
    assert parse.micros_to_ms(1790999000) == 1790999000000
    assert parse.micros_to_ms(None) is None
