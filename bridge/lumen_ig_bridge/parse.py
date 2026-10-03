"""Turns Instagram's private API JSON into the bridge's own shapes.

The bridge reads raw responses instead of instagrapi's models: a field Instagram
adds, renames or drops then costs one message or one reel, never a whole inbox.
Every function here is pure and defensive: a missing key gives a default, an
item that can't be understood becomes an `unsupported` message or is skipped.

Image URLs go through the bridge (`MediaSigner.proxy`): Instagram's CDN sends
`Cross-Origin-Resource-Policy: same-origin` on images, so a web app on another
origin can't show them. Video URLs are returned as they are (the CDN sends
`Cross-Origin-Resource-Policy: cross-origin` on video) with a proxied fallback.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, Iterable, List, Optional

Json = Dict[str, Any]
Proxy = Callable[[Optional[str]], Optional[str]]

# The video the glasses play: the smallest version at least this many pixels on
# its short side. The HUD shows 480x480; reels come at 720 or 1080 wide.
VIDEO_SHORT_SIDE = 480
# Posters, thumbnails and avatars: the smallest candidate at least this wide.
IMAGE_WIDTH = 640
AVATAR_WIDTH = 150

_SHORTCODE = re.compile(r"instagram\.com/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)")


def _int(value: Any, default: Optional[int] = None) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _str(value: Any) -> str:
    return value if isinstance(value, str) else ("" if value is None else str(value))


def _dict(value: Any) -> Json:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def seconds_to_ms(value: Any) -> Optional[int]:
    """Instagram media timestamps are in seconds."""
    number = _int(value)
    return number * 1000 if number is not None else None


def micros_to_ms(value: Any) -> Optional[int]:
    """Direct timestamps are in microseconds (sometimes as strings)."""
    number = _int(value)
    if number is None:
        return None
    # Some payloads already carry ms or s; normalise by magnitude.
    if number > 10**14:
        return number // 1000
    if number > 10**11:
        return number
    return number * 1000


def pick_image(candidates: Iterable[Any], width: int = IMAGE_WIDTH) -> Optional[str]:
    """The smallest candidate at least `width` wide, else the largest one."""
    usable = [c for c in candidates if isinstance(c, dict) and c.get("url")]
    if not usable:
        return None
    usable.sort(key=lambda c: (_int(c.get("width"), 0) or 0) * (_int(c.get("height"), 0) or 0))
    for candidate in usable:
        if (_int(candidate.get("width"), 0) or 0) >= width:
            return candidate["url"]
    return usable[-1]["url"]


def pick_video(versions: Iterable[Any]) -> Optional[Json]:
    """The smallest version whose short side is at least VIDEO_SHORT_SIDE, else the largest."""
    usable = [v for v in versions if isinstance(v, dict) and v.get("url")]
    if not usable:
        return None
    usable.sort(key=lambda v: (_int(v.get("width"), 0) or 0) * (_int(v.get("height"), 0) or 0))
    for version in usable:
        short = min(_int(version.get("width"), 0) or 0, _int(version.get("height"), 0) or 0)
        if short >= VIDEO_SHORT_SIDE:
            return version
    return usable[-1]


def shortcode_from_url(url: Any) -> Optional[str]:
    match = _SHORTCODE.search(_str(url))
    return match.group(1) if match else None


def user(raw: Any, proxy: Proxy) -> Optional[Json]:
    data = _dict(raw)
    user_id = _str(data.get("pk") or data.get("pk_id") or data.get("id") or data.get("strong_id__"))
    if not user_id:
        return None
    avatar = data.get("profile_pic_url")
    return {
        "id": user_id,
        "username": _str(data.get("username")),
        "fullName": _str(data.get("full_name")),
        "avatarUrl": proxy(avatar) if avatar else None,
        "verified": bool(data.get("is_verified")),
    }


def _caption(media: Json) -> str:
    caption = media.get("caption")
    if isinstance(caption, dict):
        return _str(caption.get("text"))
    return _str(media.get("caption_text"))


def _audio_title(media: Json) -> Optional[str]:
    clips = _dict(media.get("clips_metadata"))
    music = _dict(_dict(clips.get("music_info")).get("music_asset_info"))
    if music.get("title"):
        artist = _str(music.get("display_artist"))
        return f"{artist} · {music['title']}" if artist else _str(music["title"])
    sound = _dict(clips.get("original_sound_info"))
    if sound:
        return _str(sound.get("original_audio_title")) or None
    return None


def reel(raw: Any, proxy: Proxy) -> Optional[Json]:
    """A playable reel, or None when the item has no video (an ad card, a photo)."""
    media = _dict(raw)
    if not media:
        return None
    version = pick_video(_list(media.get("video_versions")))
    if version is None:
        return None
    owner = user(media.get("user"), proxy)
    pk = _str(media.get("pk"))
    media_id = _str(media.get("id")) or (f"{pk}_{owner['id']}" if pk and owner else pk)
    if not pk or not media_id:
        return None
    poster = pick_image(_list(_dict(media.get("image_versions2")).get("candidates")))
    likes_hidden = bool(media.get("like_and_view_counts_disabled"))
    width = _int(version.get("width")) or _int(media.get("original_width"))
    height = _int(version.get("height")) or _int(media.get("original_height"))
    return {
        "id": media_id,
        "pk": pk,
        "code": _str(media.get("code")),
        "user": owner,
        "caption": _caption(media),
        "takenAt": seconds_to_ms(media.get("taken_at")),
        "videoUrl": version["url"],
        "videoProxyUrl": proxy(version["url"]),
        "posterUrl": proxy(poster) if poster else None,
        "width": width,
        "height": height,
        "durationSec": float(media.get("video_duration") or 0) or None,
        "likeCount": None if likes_hidden else _int(media.get("like_count"), 0),
        "commentCount": _int(media.get("comment_count"), 0),
        "liked": bool(media.get("has_liked")),
        "saved": bool(media.get("has_viewer_saved") or media.get("viewer_has_saved")),
        "commentsDisabled": bool(media.get("comments_disabled") or media.get("commenting_disabled_for_viewer")),
        "audioTitle": _audio_title(media),
        "isAd": bool(media.get("ad_id") or media.get("is_ad") or media.get("ad_action")),
    }


def reels_page(raw: Any, proxy: Proxy) -> Json:
    """`clips/connected/` (and the other clips feeds): items, then the next cursor."""
    data = _dict(raw)
    items = _list(data.get("items")) or _list(data.get("items_with_ads"))
    reels: List[Json] = []
    seen = set()
    for item in items:
        media = _dict(item).get("media") if isinstance(item, dict) and "media" in item else item
        parsed = reel(media, proxy)
        if parsed is None or parsed["isAd"] or parsed["id"] in seen:
            continue
        seen.add(parsed["id"])
        reels.append(parsed)
    paging = _dict(data.get("paging_info"))
    cursor = _str(paging.get("max_id")) if paging.get("more_available") else ""
    return {"items": reels, "nextCursor": cursor or None}


def comment(raw: Any, proxy: Proxy) -> Optional[Json]:
    data = _dict(raw)
    comment_id = _str(data.get("pk") or data.get("id"))
    if not comment_id:
        return None
    return {
        "id": comment_id,
        "user": user(data.get("user"), proxy),
        "text": _str(data.get("text")),
        "createdAt": seconds_to_ms(data.get("created_at_utc") or data.get("created_at")),
        "likeCount": _int(data.get("comment_like_count"), 0),
        "replyCount": _int(data.get("child_comment_count"), 0),
    }


def comments_page(raw: Any, proxy: Proxy) -> Json:
    data = _dict(raw)
    items = [c for c in (comment(item, proxy) for item in _list(data.get("comments"))) if c]
    cursor = _str(data.get("next_max_id")) if data.get("has_more_comments") else ""
    return {
        "items": items,
        "nextCursor": cursor or None,
        "commentCount": _int(data.get("comment_count")),
        "commentsDisabled": bool(data.get("comments_disabled")),
    }


# ---------------------------------------------------------------- Direct


def _reactions(raw: Any, viewer_id: str) -> List[Json]:
    data = _dict(raw)
    counts: Dict[str, Json] = {}
    for entry in _list(data.get("emojis")):
        entry = _dict(entry)
        emoji = _str(entry.get("emoji"))
        if not emoji:
            continue
        summary = counts.setdefault(emoji, {"emoji": emoji, "count": 0, "mine": False})
        summary["count"] += 1
        if _str(entry.get("sender_id")) == viewer_id:
            summary["mine"] = True
    likes = _list(data.get("likes"))
    if likes and "❤️" not in counts and "❤" not in counts:
        mine = any(_str(_dict(like).get("sender_id")) == viewer_id for like in likes)
        counts["❤️"] = {"emoji": "❤️", "count": len(likes), "mine": mine}
    return list(counts.values())


def _shared_reel_from_media(media: Json, proxy: Proxy) -> Json:
    """A reel shared in a thread, from a full media object (playable as it is)."""
    parsed = reel(media, proxy)
    owner = user(media.get("user"), proxy)
    thumb = pick_image(_list(_dict(media.get("image_versions2")).get("candidates")))
    return {
        "code": _str(media.get("code")) or None,
        "id": parsed["id"] if parsed else (_str(media.get("id")) or None),
        "thumbnailUrl": proxy(thumb) if thumb else None,
        "author": owner["username"] if owner else None,
        "caption": _caption(media) or None,
        "playable": parsed is not None,
    }


def _shared_reel_from_xma(xma: Json, proxy: Proxy) -> Optional[Json]:
    """A reel shared in a thread as an XMA card: a link and a preview, no video."""
    target = _str(xma.get("target_url"))
    code = shortcode_from_url(target)
    preview = xma.get("preview_url") or _dict(xma.get("preview_url_info")).get("url")
    author = _str(xma.get("header_title_text")) or _str(xma.get("title_text")) or None
    if not code and not preview:
        return None
    return {
        "code": code,
        "id": None,
        "thumbnailUrl": proxy(_str(preview)) if preview else None,
        "author": author,
        "caption": _str(xma.get("subtitle_text")) or None,
        "playable": code is not None,
    }


def _first(value: Any) -> Json:
    items = _list(value)
    return _dict(items[0]) if items else _dict(value)


def _direct_media(media: Json, proxy: Proxy) -> Json:
    image = pick_image(_list(_dict(media.get("image_versions2")).get("candidates")))
    video = pick_video(_list(media.get("video_versions")))
    return {
        "imageUrl": proxy(image) if image else None,
        "videoUrl": video["url"] if video else None,
        "videoProxyUrl": proxy(video["url"]) if video else None,
    }


def message(raw: Any, viewer_id: str, proxy: Proxy) -> Optional[Json]:
    """One Direct item. Unknown item types become `unsupported` with their type."""
    item = _dict(raw)
    item_id = _str(item.get("item_id") or item.get("id"))
    if not item_id:
        return None
    sender = _str(item.get("user_id"))
    kind = _str(item.get("item_type"))
    out: Json = {
        "id": item_id,
        "senderId": sender or None,
        "fromMe": bool(sender) and sender == viewer_id,
        "timestamp": micros_to_ms(item.get("timestamp")),
        "kind": "unsupported",
        "text": "",
        "itemType": kind,
        "reactions": _reactions(item.get("reactions"), viewer_id),
        "replyTo": None,
    }
    replied = _dict(item.get("replied_to_message"))
    if replied:
        out["replyTo"] = {"id": _str(replied.get("item_id")) or None, "text": _str(replied.get("text"))}

    if kind == "text":
        out.update(kind="text", text=_str(item.get("text")))
    elif kind == "link":
        out.update(kind="text", text=_str(_dict(item.get("link")).get("text")) or _str(item.get("text")))
    elif kind == "like":
        out.update(kind="like", text=_str(item.get("like")) or "❤️")
    elif kind == "clip":
        clip = _dict(item.get("clip"))
        media = _dict(clip.get("clip")) or clip
        out.update(kind="reel", reel=_shared_reel_from_media(media, proxy))
    elif kind == "xma_clip":
        shared = _shared_reel_from_xma(_first(item.get("xma_clip")), proxy)
        if shared:
            out.update(kind="reel", reel=shared)
    elif kind == "media_share":
        media = _dict(item.get("media_share"))
        if _list(media.get("video_versions")) and _str(media.get("product_type")) == "clips":
            out.update(kind="reel", reel=_shared_reel_from_media(media, proxy))
        else:
            owner = user(media.get("user"), proxy)
            out.update(kind="post", text=_caption(media), post={
                "code": _str(media.get("code")) or None,
                "author": owner["username"] if owner else None,
                **_direct_media(media, proxy),
            })
    elif kind in ("xma_media_share", "generic_xma", "xma_link", "xma_story_share", "xma_profile"):
        xma = _first(item.get(kind))
        code = shortcode_from_url(xma.get("target_url"))
        if kind == "xma_media_share" and code and "/reel" in _str(xma.get("target_url")):
            shared = _shared_reel_from_xma(xma, proxy)
            if shared:
                out.update(kind="reel", reel=shared)
        if out["kind"] == "unsupported":
            preview = xma.get("preview_url")
            out.update(kind="post", text=_str(xma.get("title_text")) or _str(item.get("text")), post={
                "code": code,
                "author": _str(xma.get("header_title_text")) or None,
                "imageUrl": proxy(_str(preview)) if preview else None,
                "videoUrl": None,
                "videoProxyUrl": None,
            })
    elif kind == "voice_media":
        media = _dict(_dict(item.get("voice_media")).get("media"))
        audio = _dict(media.get("audio"))
        src = _str(audio.get("audio_src"))
        if src:
            duration = _int(audio.get("duration"), 0) or 0
            out.update(kind="voice", voice={
                "audioUrl": src,
                "audioProxyUrl": proxy(src),
                "durationSec": round(duration / 1000, 1) if duration else None,
            })
    elif kind == "media":
        media = _dict(item.get("media"))
        parsed = _direct_media(media, proxy)
        out.update(kind="video" if parsed["videoUrl"] else "photo", media=parsed)
    elif kind in ("raven_media", "visual_media"):
        out.update(kind="ephemeral")
    elif kind in ("story_share", "reel_share"):
        share = _dict(item.get(kind))
        out.update(kind="story", text=_str(share.get("text")) or _str(item.get("text")))
    elif kind == "animated_media":
        out.update(kind="gif")
    elif kind == "action_log":
        out.update(kind="event", text=_str(_dict(item.get("action_log")).get("description")))
    elif kind == "placeholder":
        out.update(kind="unsupported", text=_str(_dict(item.get("placeholder")).get("message")))
    return out


def _thread_title(thread: Json, users: List[Json]) -> str:
    title = _str(thread.get("thread_title"))
    if title:
        return title
    names = [u["username"] for u in users if u.get("username")]
    return ", ".join(names)


def _unread(thread: Json, viewer_id: str, newest: Optional[Json]) -> bool:
    if newest is None or newest.get("fromMe"):
        return False
    read_state = _int(thread.get("read_state"))
    if read_state is not None:
        return read_state == 1
    seen = _dict(_dict(thread.get("last_seen_at")).get(viewer_id))
    return _str(seen.get("item_id")) != newest["id"]


def thread(raw: Any, viewer_id: str, proxy: Proxy) -> Optional[Json]:
    """A thread summary for the inbox (the newest message as its preview)."""
    data = _dict(raw)
    thread_id = _str(data.get("thread_id"))
    if not thread_id:
        return None
    users = [u for u in (user(item, proxy) for item in _list(data.get("users"))) if u]
    items = _list(data.get("items"))
    newest = message(items[0], viewer_id, proxy) if items else None
    names = {u["id"]: u["username"] for u in users}
    if newest and not newest["fromMe"]:
        newest["senderName"] = names.get(newest["senderId"] or "")
    return {
        "id": thread_id,
        "title": _thread_title(data, users),
        "isGroup": bool(data.get("is_group")),
        "users": users,
        "muted": bool(data.get("muted")),
        "unread": _unread(data, viewer_id, newest),
        "lastActivityAt": micros_to_ms(data.get("last_activity_at")),
        "lastMessage": newest,
    }


def inbox_page(raw: Any, viewer_id: str, proxy: Proxy) -> Json:
    inbox = _dict(_dict(raw).get("inbox"))
    threads = [t for t in (thread(item, viewer_id, proxy) for item in _list(inbox.get("threads"))) if t]
    cursor = _str(inbox.get("oldest_cursor")) if inbox.get("has_older") else ""
    return {"items": threads, "nextCursor": cursor or None}


def thread_page(raw: Any, viewer_id: str, proxy: Proxy) -> Json:
    """`direct_v2/threads/{id}/`: the thread and a page of messages, oldest first."""
    data = _dict(_dict(raw).get("thread")) or _dict(raw)
    summary = thread(data, viewer_id, proxy)
    names = {u["id"]: u["username"] for u in (summary or {}).get("users", [])}
    messages = []
    for item in reversed(_list(data.get("items"))):
        parsed = message(item, viewer_id, proxy)
        if parsed is None:
            continue
        parsed["senderName"] = None if parsed["fromMe"] else names.get(parsed["senderId"] or "")
        messages.append(parsed)
    cursor = _str(data.get("oldest_cursor")) if data.get("has_older") else ""
    return {"thread": summary, "messages": messages, "olderCursor": cursor or None}


def account(raw: Any, proxy: Proxy) -> Json:
    data = _dict(_dict(raw).get("user")) or _dict(raw)
    return user(data, proxy) or {}
