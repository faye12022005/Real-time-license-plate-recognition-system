"""Tests for the threaded stream reader."""

from pathlib import Path

import cv2
import numpy as np

from src.pipeline.stream_reader import StreamReader


def write_video(path: Path, frame_count: int = 5, width: int = 64, height: int = 48) -> None:
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        10.0,
        (width, height),
    )
    assert writer.isOpened()
    for index in range(frame_count):
        frame = np.full((height, width, 3), index * 30, dtype=np.uint8)
        writer.write(frame)
    writer.release()


def test_stream_reader_reads_full_video(tmp_path: Path) -> None:
    video_path = tmp_path / "sample.mp4"
    write_video(video_path)

    with StreamReader(video_path, queue_size=4) as reader:
        assert not reader.is_live
        assert reader.fps == 10.0
        assert (reader.width, reader.height) == (64, 48)
        frames = list(reader.frames())

    assert len(frames) == 5
    assert reader.frame_count >= len(frames)
    assert frames[0].shape[:2] == (48, 64)
