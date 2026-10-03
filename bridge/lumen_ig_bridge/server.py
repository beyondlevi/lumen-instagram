"""The bridge's HTTP API, used by Instagram for Lumen.

Every route under /v1 except /v1/health and the signed media links needs
`Authorization: Bearer <BRIDGE_KEY>`. CORS is open to any origin: the app runs
from a loopback origin on the glasses (`http://127.0.0.1:<port>`), and the key,
not the origin, is what admits it. Times are epoch milliseconds; media links
that start with `/v1/m/` are relative to the bridge.
"""

from __future__ import annotations

import hmac
import json
from contextlib import asynccontextmanager
import re
from pathlib import Path as FsPath
from typing import Any, Dict, List, Optional

import httpx
from fastapi import Depends, FastAPI, File, Form, Path, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from . import __version__, voice
from .config import Config
from .errors import BridgeError
from .instagram import Instagram
from .media import MediaSigner

DIGITS = r"^\d{1,40}$"
MEDIA_ID = r"^\d{1,40}(_\d{1,40})?$"
SHORTCODE = r"^[A-Za-z0-9_-]{5,64}$"
MAX_TEXT = 1000
PROXY_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag")


class TextBody(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT)


class ReactionBody(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)
    remove: bool = False


class SeenBody(BaseModel):
    itemId: str = Field(pattern=DIGITS)


class ReelsSeenBody(BaseModel):
    ids: List[str] = Field(max_length=20)


class ShareBody(BaseModel):
    threadIds: List[str] = Field(min_length=1, max_length=5)


def _error(status: int, code: str, message: str) -> BridgeError:
    return BridgeError(status, code, message)


def create_app(
    config: Config,
    instagram: Optional[Instagram] = None,
    signer: Optional[MediaSigner] = None,
    media_transport: Optional[httpx.AsyncBaseTransport] = None,
) -> FastAPI:
    signer = signer or MediaSigner(config.bridge_key)
    service = instagram or Instagram(config, signer)
    media_client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=False,
                                     proxy=None if media_transport else (config.proxy or None),
                                     transport=media_transport)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await media_client.aclose()

    app = FastAPI(title="Lumen Instagram bridge", version=__version__, docs_url=None, redoc_url=None,
                  openapi_url=None, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Range"],
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Retry-After"],
        max_age=600,
    )
    expected = f"Bearer {config.bridge_key}".encode("utf-8")

    @app.exception_handler(BridgeError)
    async def bridge_error(_: Request, error: BridgeError) -> JSONResponse:
        headers = {"Retry-After": str(error.retry_after)} if error.retry_after is not None else None
        return JSONResponse(error.body(), status_code=error.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, error: RequestValidationError) -> JSONResponse:
        first = error.errors()[0] if error.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", []) if part != "body")
        return JSONResponse(_error(400, "bad_request", f"Invalid {where or 'request'}").body(), status_code=400)

    def require_key(request: Request) -> None:
        given = request.headers.get("authorization", "").encode("utf-8")
        if not hmac.compare_digest(given, expected):
            raise _error(401, "bad_key", "The bridge key is missing or wrong.")

    keyed = [Depends(require_key)]

    @app.get("/v1/health")
    def health() -> Dict[str, Any]:
        return {"ok": True, "version": __version__}

    @app.get("/v1/me", dependencies=keyed)
    def me() -> Dict[str, Any]:
        return {"user": service.me()}

    # ---------------------------------------------------------------- reels

    @app.get("/v1/reels", dependencies=keyed)
    def reels(cursor: Optional[str] = Query(None, max_length=512)) -> Dict[str, Any]:
        return service.reels(cursor)

    @app.get("/v1/reels/code/{code}", dependencies=keyed)
    def reel_by_code(code: str = Path(pattern=SHORTCODE)) -> Dict[str, Any]:
        return {"reel": service.reel_by_code(code)}

    @app.post("/v1/reels/seen", dependencies=keyed)
    def reels_seen(body: ReelsSeenBody) -> Dict[str, Any]:
        ids = [media_id for media_id in body.ids if re.match(MEDIA_ID, media_id)]
        return {"ok": service.mark_reels_seen(ids)}

    @app.post("/v1/reels/{media_id}/like", dependencies=keyed)
    def like(media_id: str = Path(pattern=MEDIA_ID)) -> Dict[str, Any]:
        service.set_liked(media_id, True)
        return {"liked": True}

    @app.delete("/v1/reels/{media_id}/like", dependencies=keyed)
    def unlike(media_id: str = Path(pattern=MEDIA_ID)) -> Dict[str, Any]:
        service.set_liked(media_id, False)
        return {"liked": False}

    @app.post("/v1/reels/{media_id}/save", dependencies=keyed)
    def save(media_id: str = Path(pattern=MEDIA_ID)) -> Dict[str, Any]:
        service.set_saved(media_id, True)
        return {"saved": True}

    @app.delete("/v1/reels/{media_id}/save", dependencies=keyed)
    def unsave(media_id: str = Path(pattern=MEDIA_ID)) -> Dict[str, Any]:
        service.set_saved(media_id, False)
        return {"saved": False}

    @app.get("/v1/reels/{media_id}/comments", dependencies=keyed)
    def comments(media_id: str = Path(pattern=MEDIA_ID), cursor: Optional[str] = Query(None, max_length=512)) -> Dict[str, Any]:
        return service.comments(media_id, cursor)

    @app.post("/v1/reels/{media_id}/share", dependencies=keyed)
    def share(body: ShareBody, media_id: str = Path(pattern=MEDIA_ID)) -> Dict[str, Any]:
        if not all(re.match(DIGITS, thread_id) for thread_id in body.threadIds):
            raise _error(400, "bad_request", "Invalid threadIds")
        service.share_reel(media_id, body.threadIds)
        return {"ok": True}

    # ---------------------------------------------------------------- Direct

    @app.get("/v1/threads", dependencies=keyed)
    def threads(cursor: Optional[str] = Query(None, max_length=512)) -> Dict[str, Any]:
        return service.inbox(cursor)

    @app.get("/v1/threads/{thread_id}", dependencies=keyed)
    def thread(thread_id: str = Path(pattern=DIGITS), cursor: Optional[str] = Query(None, max_length=512)) -> Dict[str, Any]:
        return service.thread(thread_id, cursor)

    @app.post("/v1/threads/{thread_id}/text", dependencies=keyed)
    def send_text(body: TextBody, thread_id: str = Path(pattern=DIGITS)) -> Dict[str, Any]:
        text = body.text.strip()
        if not text:
            raise _error(400, "bad_request", "The message is empty.")
        return {"ok": True, "id": service.send_text(thread_id, text)}

    @app.post("/v1/threads/{thread_id}/voice", dependencies=keyed)
    async def send_voice(
        thread_id: str = Path(pattern=DIGITS),
        audio: UploadFile = File(...),
        levels: Optional[str] = Form(None),
    ) -> Dict[str, Any]:
        data = await audio.read(voice.MAX_UPLOAD_BYTES + 1)
        try:
            parsed_levels = json.loads(levels) if levels else None
        except ValueError:
            parsed_levels = None
        bars = voice.waveform(parsed_levels if isinstance(parsed_levels, list) else None)

        def convert_and_send() -> Optional[str]:
            with voice.temporary_directory() as directory:
                m4a = voice.to_m4a(data, FsPath(directory))
                return service.send_voice(thread_id, m4a, bars)

        return {"ok": True, "id": await run_in_threadpool(convert_and_send)}

    @app.post("/v1/threads/{thread_id}/items/{item_id}/reaction", dependencies=keyed)
    def react(body: ReactionBody, thread_id: str = Path(pattern=DIGITS), item_id: str = Path(pattern=DIGITS)) -> Dict[str, Any]:
        service.set_reaction(thread_id, item_id, body.emoji, not body.remove)
        return {"ok": True}

    @app.post("/v1/threads/{thread_id}/seen", dependencies=keyed)
    def seen(body: SeenBody, thread_id: str = Path(pattern=DIGITS)) -> Dict[str, Any]:
        return {"ok": service.mark_seen(thread_id, body.itemId)}

    # ---------------------------------------------------------------- media

    @app.get("/v1/m/{token}")
    async def media(token: str, request: Request) -> Response:
        url = signer.resolve(token)
        if url is None:
            raise _error(404, "not_found", "Unknown media link.")
        headers = {"Accept": request.headers.get("accept", "*/*")}
        if request.headers.get("range"):
            headers["Range"] = request.headers["range"]
        try:
            upstream = await media_client.send(media_client.build_request("GET", url, headers=headers), stream=True)
        except httpx.HTTPError as error:
            raise _error(503, "network", "The bridge couldn't reach Instagram's media server.") from error
        if upstream.status_code not in (200, 206):
            status = upstream.status_code
            await upstream.aclose()
            raise _error(404 if status in (403, 404, 410) else 502, "media_unavailable",
                         f"Instagram's media server answered {status}.")
        out = {name: upstream.headers[name] for name in PROXY_HEADERS if name in upstream.headers}
        out["Cache-Control"] = "private, max-age=86400"
        out["Cross-Origin-Resource-Policy"] = "cross-origin"
        return StreamingResponse(upstream.aiter_raw(), status_code=upstream.status_code, headers=out,
                                 background=BackgroundTask(upstream.aclose))

    return app
