"""Video and camera stream frame reader using OpenCV."""

from dataclasses import dataclass
from pathlib import Path
from typing import Generator, Optional, Tuple
import cv2  # type: ignore
import numpy as np  # type: ignore


@dataclass
class VideoMetadata:
    """Metadata of the video or stream source."""

    total_frames: int
    fps: float
    duration_seconds: float
    width: int
    height: int


class VideoStreamReader:
    """Reader for video files and RTSP camera streams."""

    def __init__(self, source: str) -> None:
        self.source = str(source)
        self.cap: Optional[cv2.VideoCapture] = None
        self.metadata: Optional[VideoMetadata] = None

    def open(self) -> bool:
        """Open video capture source and probe metadata."""
        self.cap = cv2.VideoCapture(self.source)
        if not self.cap.isOpened():
            return False

        total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(self.cap.get(cv2.CAP_PROP_FPS)) or 25.0
        width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = round(total_frames / fps, 2) if total_frames > 0 else 0.0

        self.metadata = VideoMetadata(
            total_frames=total_frames,
            fps=fps,
            duration_seconds=duration,
            width=width,
            height=height,
        )
        return True

    def read_frame(self) -> Tuple[bool, Optional[np.ndarray], int, int, str]:
        """Read next frame from stream.

        Returns:
            Tuple of:
            - ret (bool): True if frame read successfully
            - frame (np.ndarray | None): BGR image frame
            - frame_idx (int): Current frame index
            - pts_ms (int): Presentation timestamp in milliseconds
            - video_time_str (str): MM:SS formatted timestamp
        """
        if self.cap is None or not self.cap.isOpened():
            return False, None, 0, 0, "00:00"

        ret, frame = self.cap.read()
        if not ret or frame is None:
            return False, None, 0, 0, "00:00"

        frame_idx = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
        fps = self.metadata.fps if self.metadata else 25.0
        pts_ms = int((frame_idx / fps) * 1000)

        total_sec = int(frame_idx / fps)
        mins = total_sec // 60
        secs = total_sec % 60
        time_str = f"{mins:02d}:{secs:02d}"

        return True, frame, frame_idx, pts_ms, time_str

    def release(self) -> None:
        """Release video capture device."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

    def __enter__(self) -> "VideoStreamReader":
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.release()
