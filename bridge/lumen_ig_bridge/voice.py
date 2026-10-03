"""Voice notes: the glasses record Ogg Opus, Instagram takes AAC in MP4 (.m4a)."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional, Sequence

from .errors import BridgeError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SECONDS = 300
WAVEFORM_POINTS = 70


def to_m4a(audio: bytes, directory: Path) -> Path:
    """Converts any audio ffmpeg reads into a mono AAC .m4a in `directory`."""
    if not audio:
        raise BridgeError(400, "bad_request", "The voice note is empty.")
    if len(audio) > MAX_UPLOAD_BYTES:
        raise BridgeError(413, "too_large", "The voice note is larger than 5 MB.")
    source = directory / "voice-in"
    target = directory / "voice.m4a"
    source.write_bytes(audio)
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-t", str(MAX_SECONDS),
        "-vn", "-ac", "1", "-ar", "44100", "-c:a", "aac", "-b:a", "64k",
        "-movflags", "+faststart", str(target),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, timeout=60)
    except FileNotFoundError as error:
        raise BridgeError(500, "ffmpeg_missing", "The bridge needs ffmpeg to send voice notes.") from error
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise BridgeError(400, "bad_audio", "The bridge couldn't read this audio.") from error
    if not target.exists() or target.stat().st_size == 0:
        raise BridgeError(400, "bad_audio", "The bridge couldn't read this audio.")
    return target


def waveform(levels: Optional[Sequence[float]]) -> Optional[List[float]]:
    """The recording's input levels (0..1, about 5 a second), resampled to Instagram's 70 bars."""
    values = [min(1.0, max(0.0, float(level))) for level in (levels or []) if isinstance(level, (int, float))]
    if not values:
        return None
    peak = max(values) or 1.0
    bars = []
    for index in range(WAVEFORM_POINTS):
        start = index * len(values) // WAVEFORM_POINTS
        end = max(start + 1, (index + 1) * len(values) // WAVEFORM_POINTS)
        chunk = values[start:end] or [values[min(start, len(values) - 1)]]
        # Never flat: Instagram draws zeros as dots.
        bars.append(round(max(0.05, max(chunk) / peak), 3))
    return bars


def temporary_directory() -> tempfile.TemporaryDirectory:
    return tempfile.TemporaryDirectory(prefix="lumen-ig-voice-")
