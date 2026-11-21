"""Video transcoding and codec compatibility utilities for web playback.

Ensures all generated annotated videos and uploaded media use web-standard H.264 (avc1)
so modern browsers (Chrome, Edge, Firefox, Safari) can play them via HTML5 <video>.
"""

from __future__ import annotations

import bz2
import logging
import os
import shutil
import urllib.request
from pathlib import Path
from typing import Optional, Tuple

import cv2

LOGGER = logging.getLogger(__name__)

OPENH264_URL = "https://ciscobinary.openh264.org/openh264-2.5.0-win64.dll.bz2"
OPENH264_FILENAME = "openh264-2.5.0-win64.dll"


def ensure_h264_dll() -> bool:
    """Verify or install Cisco OpenH264 codec DLL for OpenCV Windows."""
    try:
        import sys
        cv2_dir = Path(os.path.dirname(cv2.__file__))
        py_dir = Path(sys.executable).parent
        cwd_dir = Path.cwd()

        targets = [
            cv2_dir / OPENH264_FILENAME,
            py_dir / OPENH264_FILENAME,
            cwd_dir / OPENH264_FILENAME,
        ]

        if any(t.exists() and t.stat().st_size > 100_000 for t in targets):
            # Already exists in at least one location; ensure cv2_dir has it
            if not (cv2_dir / OPENH264_FILENAME).exists():
                for t in targets:
                    if t.exists() and t.stat().st_size > 100_000:
                        try:
                            shutil.copy(str(t), str(cv2_dir / OPENH264_FILENAME))
                        except Exception:
                            pass
                        break
            return True

        LOGGER.info("Downloading %s for browser-compatible H.264 video encoding...", OPENH264_FILENAME)
        req = urllib.request.Request(OPENH264_URL, headers={"User-Agent": "SmartALPR/2.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            compressed = resp.read()
        dll_bytes = bz2.decompress(compressed)

        if len(dll_bytes) > 100_000:
            for dest in (cv2_dir / OPENH264_FILENAME, py_dir / OPENH264_FILENAME, cwd_dir / OPENH264_FILENAME):
                try:
                    dest.write_bytes(dll_bytes)
                except Exception as write_err:
                    LOGGER.debug("Could not write %s: %s", dest, write_err)
            LOGGER.info("Installed OpenH264 DLL successfully.")
            return True
    except Exception as exc:
        LOGGER.warning("Could not auto-download OpenH264: %s", exc)

    return False


def create_browser_video_writer(
    output_path: Path | str,
    fps: float,
    size: Tuple[int, int],
) -> Tuple[Optional[cv2.VideoWriter], str]:
    """Create a VideoWriter optimized for browser playback.

    Tries H.264 (avc1) first for universal browser support, falling back to mp4v.
    """
    ensure_h264_dll()
    output_str = str(output_path)

    for codec_tag in ("avc1", "H264", "mp4v"):
        try:
            fourcc = cv2.VideoWriter_fourcc(*codec_tag)
            writer = cv2.VideoWriter(output_str, fourcc, max(1.0, float(fps)), size)
            if writer is not None and writer.isOpened():
                LOGGER.info("Created video writer for %s with codec %s", output_str, codec_tag)
                return writer, codec_tag
        except Exception as exc:
            LOGGER.debug("Codec %s failed for %s: %s", codec_tag, output_str, exc)

    return None, ""


def transcode_to_h264(input_path: Path | str, output_path: Optional[Path | str] = None) -> bool:
    """Re-encode an existing video file to H.264 (avc1) in-place or to a target path."""
    src = Path(input_path)
    if not src.exists() or src.stat().st_size == 0:
        return False

    dst = Path(output_path) if output_path else src.with_name(f"{src.stem}__h264_tmp.mp4")

    cap = cv2.VideoCapture(str(src))
    if not cap.isOpened():
        return False

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if width <= 0 or height <= 0:
        cap.release()
        return False

    writer, codec = create_browser_video_writer(dst, fps, (width, height))
    if not writer or codec != "avc1":
        cap.release()
        if writer:
            writer.release()
        if dst.exists() and dst != src:
            dst.unlink(missing_ok=True)
        return False

    try:
        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break
            writer.write(frame)
    finally:
        cap.release()
        writer.release()

    if dst.exists() and dst.stat().st_size > 1000:
        if output_path is None:
            # Atomic in-place replace
            src.unlink(missing_ok=True)
            dst.rename(src)
        return True

    if dst.exists() and dst != src:
        dst.unlink(missing_ok=True)
    return False


def is_mp4v_codec(video_file: Path) -> bool:
    """Check if an MP4 file is encoded with legacy mp4v (moov atom is usually near the end)."""
    try:
        size = video_file.stat().st_size
        if size == 0:
            return False
        with open(video_file, "rb") as f:
            head = f.read(100_000)
            if b"mp4v" in head:
                return True
            if size > 100_000:
                seek_pos = max(0, size - 200_000)
                f.seek(seek_pos)
                tail = f.read(200_000)
                if b"mp4v" in tail:
                    return True
    except Exception:
        pass
    return False


def transcode_all_legacy_outputs(output_dir: Path | str) -> int:
    """Scan output directory and convert any legacy mp4v videos to avc1."""
    root = Path(output_dir)
    if not root.exists():
        return 0

    converted = 0
    for video_file in root.rglob("*.mp4"):
        if "__h264_tmp" in video_file.name:
            video_file.unlink(missing_ok=True)
            continue
        try:
            if is_mp4v_codec(video_file):
                print(f"Transcoding legacy mp4v video to H.264: {video_file.name}...")
                LOGGER.info("Transcoding legacy mp4v video to H.264: %s", video_file)
                if transcode_to_h264(video_file):
                    converted += 1
                    print(f"  -> Successfully transcoded: {video_file.name}")
                    LOGGER.info("Transcoded successfully: %s", video_file)
        except Exception as exc:
            LOGGER.warning("Could not check/transcode %s: %s", video_file, exc)

    return converted
