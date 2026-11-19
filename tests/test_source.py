"""Tests for camera/source helpers."""

from src.utils.source import (
    camera_label,
    is_camera_source,
    parse_camera_source,
    redact_source,
    safe_filename,
)


def test_is_camera_source() -> None:
    assert is_camera_source(0)
    assert is_camera_source("1")
    assert is_camera_source("rtsp://192.168.1.10:554/stream")
    assert is_camera_source("https://example.com/camera.m3u8")
    assert not is_camera_source("video.mp4")
    assert not is_camera_source(r"D:\videos\test.mp4")


def test_parse_camera_source() -> None:
    assert parse_camera_source("0") == 0
    assert parse_camera_source("2") == 2
    assert parse_camera_source("rtsp://camera/stream") == "rtsp://camera/stream"


def test_redact_source_hides_credentials() -> None:
    assert (
        redact_source("rtsp://admin:secret@192.168.1.10:554/stream")
        == "rtsp://192.168.1.10:554/stream"
    )
    assert redact_source("rtsp://192.168.1.10:554/stream") == (
        "rtsp://192.168.1.10:554/stream"
    )
    assert redact_source(0) == "0"


def test_camera_label() -> None:
    assert camera_label(0) == "camera_0"
    assert camera_label("rtsp://admin:secret@192.168.1.10:554/live/ch1") == (
        "192.168.1.10_554_live_ch1"
    )
    assert camera_label(0, name="Cổng vào") == "Cổng_vào"


def test_safe_filename() -> None:
    assert safe_filename("a/b c") == "a_b_c"
    assert safe_filename("***") == "camera"
