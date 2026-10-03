"""Raw Instagram private API payloads, shaped like the real ones (fields trimmed).

Key names follow instagrapi's extractors (instagrapi 3.0.19) and its regression
tests. The values are made up.
"""

import os

VIEWER = "1001"
# The app's E2E tests point these at a local stand-in for the CDN.
CDN = os.environ.get("LUMEN_E2E_CDN", "https://scontent-gru2-1.cdninstagram.com")
VIDEO_CDN = os.environ.get("LUMEN_E2E_VIDEO_CDN", "https://instagram.fgru2-1.fna.fbcdn.net")


def user(pk, username, full_name=""):
    return {
        "pk": pk,
        "pk_id": str(pk),
        "username": username,
        "full_name": full_name,
        "profile_pic_url": f"{CDN}/v/t51.2885-19/{username}.jpg?stp=dst-jpg_s150x150",
        "is_verified": False,
    }


def clip_media(pk, owner, code, caption="", liked=False, saved=False, likes=1200, comments=34, hidden=False):
    return {
        "pk": pk,
        "id": f"{pk}_{owner['pk']}",
        "code": code,
        "taken_at": 1790990000,
        "media_type": 2,
        "product_type": "clips",
        "user": owner,
        "caption": {"text": caption} if caption else None,
        "like_count": likes,
        "comment_count": comments,
        "has_liked": liked,
        "has_viewer_saved": saved,
        "like_and_view_counts_disabled": hidden,
        "video_duration": 14.6,
        "original_width": 1080,
        "original_height": 1920,
        "video_versions": [
            {"type": 101, "width": 1080, "height": 1920, "url": f"{VIDEO_CDN}/o1/v/t16/{code}_1080.mp4?efg=1"},
            {"type": 102, "width": 720, "height": 1280, "url": f"{VIDEO_CDN}/o1/v/t16/{code}_720.mp4?efg=1"},
            {"type": 103, "width": 360, "height": 640, "url": f"{VIDEO_CDN}/o1/v/t16/{code}_360.mp4?efg=1"},
        ],
        "image_versions2": {
            "candidates": [
                {"width": 1080, "height": 1920, "url": f"{CDN}/v/t51.2885-15/{code}_1080.jpg"},
                {"width": 640, "height": 1137, "url": f"{CDN}/v/t51.2885-15/{code}_640.jpg"},
                {"width": 320, "height": 568, "url": f"{CDN}/v/t51.2885-15/{code}_320.jpg"},
            ]
        },
        "clips_metadata": {
            "music_info": None,
            "original_sound_info": {"original_audio_title": "Original audio"},
        },
    }


MAYA = user(2001, "maya.outdoors", "Maya Lima")
ANA = user(2002, "ana.costa", "Ana Costa")
JOAO = user(2003, "joao.p", "Joao Pedro")
BLOOM = user(2004, "studio.bloom", "Studio Bloom")


def reels_feed():
    music = clip_media("3101", BLOOM, "DBloom00001", "Tulip season at the flower market.")
    music["clips_metadata"] = {"music_info": {"music_asset_info": {"title": "Spring", "display_artist": "Aurora"}}}
    return {
        "items": [
            {"media": clip_media("3100", MAYA, "DMaya000001", "First snow on the ridge this morning.")},
            {"media": music},
            # An ad card without video, then a duplicate: both dropped.
            {"media": {"pk": "3999", "id": "3999_1", "ad_id": "9", "user": MAYA}},
            {"media": clip_media("3100", MAYA, "DMaya000001")},
            {"explore_story": {"title": "not a reel"}},
        ],
        "paging_info": {"max_id": "cursor-2", "more_available": True},
        "status": "ok",
    }


def media_info(code="DBloom00001"):
    return {"items": [clip_media("3101", BLOOM, code, "Tulip season at the flower market.")], "status": "ok"}


def comments():
    return {
        "comments": [
            {"pk": "4001", "text": "Which trail is this?", "user": user(2005, "alex.lee"), "created_at_utc": 1790993600,
             "comment_like_count": 3, "child_comment_count": 1},
            {"pk": "4002", "text": "Saving this.", "user": user(2006, "sam.rivera"), "created_at": 1790994000},
            {"text": "no pk: skipped"},
        ],
        "comment_count": 86,
        "has_more_comments": True,
        "next_max_id": "c-next",
        "status": "ok",
    }


def _item(item_id, user_id, kind, ts, **fields):
    return {"item_id": item_id, "user_id": int(user_id), "timestamp": ts, "item_type": kind, **fields}


def thread_ana(items=None):
    return {
        "thread_id": "340282366841710300949128000000000001",
        "thread_v2_id": "17890000000000001",
        "thread_title": "ana.costa",
        "is_group": False,
        "users": [ANA],
        "muted": False,
        "read_state": 1,
        "last_activity_at": 1790999000000000,
        "last_seen_at": {VIEWER: {"item_id": "5000", "timestamp": "1790990000000000"}},
        "items": items if items is not None else [
            _item("5005", ANA["pk"], "voice_media", 1790999000000000, voice_media={
                "media": {"audio": {"audio_src": f"{VIDEO_CDN}/o1/v/t2/f2/m69/voice.mp4?x=1", "duration": 8400}}
            }),
            _item("5004", VIEWER, "text", 1790998000000000, text="Looks amazing. Saturday?",
                  reactions={"emojis": [{"emoji": "❤️", "sender_id": int(ANA["pk"]), "timestamp": 1790998500000000}]}),
            _item("5003", ANA["pk"], "text", 1790997000000000, text="The place I told you about"),
            _item("5002", ANA["pk"], "xma_clip", 1790996000000000, xma_clip=[{
                "target_url": "https://www.instagram.com/reel/DBloom00001/?id=3101_2004",
                "preview_url": f"{CDN}/v/t51.2885-15/DBloom00001_preview.jpg",
                "header_title_text": "studio.bloom",
                "title_text": "studio.bloom",
            }]),
            _item("5001", ANA["pk"], "clip", 1790995000000000, clip={"clip": clip_media("3100", MAYA, "DMaya000001")}),
            _item("5000", VIEWER, "like", 1790994000000000, like="❤️"),
            _item("4999", ANA["pk"], "action_log", 1790993000000000, action_log={"description": "Ana liked a message"}),
            _item("4998", ANA["pk"], "raven_media", 1790992000000000),
            _item("4997", ANA["pk"], "brand_new_type", 1790991000000000),
        ],
        "has_older": True,
        "oldest_cursor": "older-1",
    }


def thread_crew():
    return {
        "thread_id": "340282366841710300949128000000000002",
        "thread_title": "Climbing crew",
        "is_group": True,
        "users": [JOAO, ANA],
        "read_state": 0,
        "last_activity_at": "1790980000000000",
        "items": [_item("6001", JOAO["pk"], "text", 1790980000000000, text="Saturday, 7 am at the gate?")],
    }


def thread_untitled():
    return {
        "thread_id": "340282366841710300949128000000000003",
        "thread_title": "",
        "is_group": True,
        "users": [JOAO, BLOOM],
        "last_activity_at": 1790970000000000,
        "last_seen_at": {VIEWER: {"item_id": "6999"}},
        "items": [_item("7001", BLOOM["pk"], "media_share", 1790970000000000, media_share={
            **clip_media("3200", BLOOM, "DPost000001"), "product_type": "feed", "video_versions": [],
        })],
    }


def inbox():
    return {
        "inbox": {
            "threads": [thread_ana(items=thread_ana()["items"][:1]), thread_crew(), thread_untitled(), {"no": "id"}],
            "has_older": True,
            "oldest_cursor": "inbox-older",
        },
        "viewer": user(int(VIEWER), "levi"),
        "status": "ok",
    }


def thread_response(thread_id=None):
    for build in (thread_crew, thread_untitled):
        thread = build()
        if thread_id == thread["thread_id"]:
            return {"thread": thread, "status": "ok"}
    return {"thread": thread_ana(), "status": "ok"}


def current_user():
    return {"user": user(int(VIEWER), "levi", "Levi"), "status": "ok"}
