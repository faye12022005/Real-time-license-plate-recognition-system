"""Lightweight IoU + center-distance tracker for plate detections."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable

from src.models import Detection


def _iou(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = first
    bx1, by1, bx2, by2 = second
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
        return 0.0
    intersection = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = area_a + area_b - intersection
    return intersection / float(union) if union > 0 else 0.0


def _center(bbox: tuple[int, int, int, int]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0


def _area(bbox: tuple[int, int, int, int]) -> int:
    return max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1])


def _size(bbox: tuple[int, int, int, int]) -> float:
    return max(1.0, (abs(bbox[2] - bbox[0]) + abs(bbox[3] - bbox[1])) / 2.0)


@dataclass
class Track:
    """State of one tracked plate."""

    track_id: int
    bbox: tuple[int, int, int, int]
    last_frame_index: int
    hits: int = 1
    age: int = 0
    history: list[tuple[int, int, int, int]] = field(default_factory=list)

    def update(self, bbox: tuple[int, int, int, int], frame_index: int) -> None:
        self.bbox = bbox
        self.last_frame_index = frame_index
        self.hits += 1
        self.history.append(bbox)


class IoUTracker:
    """Greedy tracker combining IoU and normalized center distance."""

    def __init__(
        self,
        iou_threshold: float = 0.3,
        max_age: int = 30,
        max_center_distance: float = 0.55,
    ) -> None:
        self.iou_threshold = float(iou_threshold)
        self.max_age = int(max_age)
        self.max_center_distance = float(max_center_distance)
        self.tracks: dict[int, Track] = {}
        self._next_id = 1

    def _match_score(
        self,
        track: Track,
        detection: Detection,
        frame_index: int,
    ) -> float:
        iou = _iou(track.bbox, detection.bbox)
        if iou >= self.iou_threshold:
            return 1.0 + iou

        missed_frames = frame_index - track.last_frame_index
        if missed_frames > 2:
            return 0.0

        track_area = _area(track.bbox)
        detection_area = detection.area
        if track_area <= 0 or detection_area <= 0:
            return 0.0
        area_ratio = detection_area / float(track_area)
        if not 0.30 <= area_ratio <= 3.30:
            return 0.0

        track_center = _center(track.bbox)
        detection_center = detection.center
        distance = math.hypot(
            detection_center[0] - track_center[0],
            detection_center[1] - track_center[1],
        )
        normalized_distance = distance / ((_size(track.bbox) + _size(detection.bbox)) / 2.0)
        if normalized_distance > self.max_center_distance:
            return 0.0
        return max(0.0, 1.0 - normalized_distance / self.max_center_distance) * 0.8

    def update(
        self,
        detections: Iterable[Detection],
        frame_index: int,
    ) -> list[tuple[Track, Detection]]:
        """Match detections to existing tracks and return matched pairs."""
        detections = list(detections)
        for track in self.tracks.values():
            track.age += 1

        candidates: list[tuple[float, int, int]] = []
        for track_index, track in enumerate(self.tracks.values()):
            for detection_index, detection in enumerate(detections):
                score = self._match_score(track, detection, frame_index)
                if score > 0.0:
                    candidates.append((score, track_index, detection_index))
        candidates.sort(reverse=True)

        matched_tracks: set[int] = set()
        matched_detections: set[int] = set()
        track_ids = list(self.tracks.keys())
        matches: list[tuple[Track, Detection]] = []

        for score, track_index, detection_index in candidates:
            if track_index in matched_tracks or detection_index in matched_detections:
                continue
            track = self.tracks[track_ids[track_index]]
            detection = detections[detection_index]
            track.update(detection.bbox, frame_index)
            matched_tracks.add(track_index)
            matched_detections.add(detection_index)
            matches.append((track, detection))

        for detection_index, detection in enumerate(detections):
            if detection_index in matched_detections:
                continue
            track = Track(
                track_id=self._next_id,
                bbox=detection.bbox,
                last_frame_index=frame_index,
                history=[detection.bbox],
            )
            self._next_id += 1
            self.tracks[track.track_id] = track
            matches.append((track, detection))

        expired = [
            track_id
            for track_id, track in self.tracks.items()
            if frame_index - track.last_frame_index > self.max_age
        ]
        for track_id in expired:
            self.tracks.pop(track_id, None)

        return matches
