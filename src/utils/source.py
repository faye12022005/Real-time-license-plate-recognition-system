"""Helpers for resolving camera and video sources."""

from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

CAMERA_SCHEMES = ("rtsp", "rtsps", "rtmp", "http", "https", "udp", "tcp")
_CAMERA_PREFIXES = tuple(f"{scheme}://" for scheme in CAMERA_SCHEMES)


def is_camera_source(source: str | int) -> bool:
    """Return True for webcam indexes and network stream URLs."""
    if isinstance(source, int):
        return True
    text = str(source).strip()
    if text.isdigit():
        return True
    return text.lower().startswith(_CAMERA_PREFIXES)


def parse_camera_source(source: str | int) -> str | int:
    """Convert a numeric camera index to int, keep URLs and device names as str."""
    if isinstance(source, int):
        return source
    text = str(source).strip()
    if text.isdigit():
        return int(text)
    return text


def redact_source(source: str | int) -> str:
    """Hide credentials embedded in RTSP/HTTP URLs before logging or persisting."""
    if not isinstance(source, str):
        return str(source)
    parsed = urlsplit(source)
    if not parsed.username and not parsed.password:
        return source

    host = parsed.hostname or ""
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme, host, parsed.path, parsed.query, parsed.fragment))


def safe_filename(value: str, fallback: str = "camera") -> str:
    """Turn an arbitrary source/name into a filesystem-safe stem."""
    cleaned = re.sub(r"[^\w.-]+", "_", str(value), flags=re.UNICODE).strip("._-")
    return cleaned[:80] or fallback


def camera_label(source: str | int, name: str | None = None) -> str:
    """Build a concise label for a camera used in output folders and records."""
    if name:
        return safe_filename(name)

    if isinstance(source, int) or str(source).strip().isdigit():
        return f"camera_{source}"

    parsed = urlsplit(str(source))
    if parsed.scheme and parsed.hostname:
        label = parsed.hostname
        if parsed.port:
            label = f"{label}_{parsed.port}"
        path = parsed.path.strip("/")
        if path:
            label = f"{label}_{path.replace('/', '_')}"
        return safe_filename(label)

    return safe_filename(Path(str(source)).stem or "camera")
