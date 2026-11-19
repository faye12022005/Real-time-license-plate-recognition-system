"""Tests for the IoU tracker."""

from __future__ import annotations

from src.core.tracker import IoUTracker
from src.models import Detection


def detection(x1: int, y1: int, x2: int, y2: int) -> Detection:
    return Detection(
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        confidence=0.9,
        class_id=0,
        class_name="license_plate",
    )


def test_tracker_keeps_same_id_for_overlapping_boxes() -> None:
    tracker = IoUTracker(iou_threshold=0.3, max_age=5)

    first_matches = tracker.update([detection(10, 10, 50, 30)], frame_index=0)
    assert len(first_matches) == 1
    first_track, _ = first_matches[0]

    second_matches = tracker.update([detection(12, 10, 52, 30)], frame_index=1)
    assert len(second_matches) == 1
    second_track, _ = second_matches[0]
    assert second_track.track_id == first_track.track_id
    assert second_track.hits == 2


def test_tracker_expires_old_tracks() -> None:
    tracker = IoUTracker(iou_threshold=0.3, max_age=2)
    tracker.update([detection(10, 10, 50, 30)], frame_index=0)
    tracker.update([], frame_index=1)
    tracker.update([], frame_index=2)
    assert len(tracker.tracks) == 1
    tracker.update([], frame_index=3)
    assert len(tracker.tracks) == 0


def test_tracker_creates_new_id_for_distant_box() -> None:
    tracker = IoUTracker(iou_threshold=0.3, max_age=5)
    first_track, _ = tracker.update([detection(10, 10, 50, 30)], frame_index=0)[0]
    second_track, _ = tracker.update([detection(300, 200, 340, 220)], frame_index=1)[0]
    assert first_track.track_id != second_track.track_id


def test_tracker_uses_center_distance_only_for_recent_frames() -> None:
    tracker = IoUTracker(iou_threshold=0.3, max_age=10)
    first_track, _ = tracker.update([detection(10, 10, 110, 110)], frame_index=0)[0]

    recent_track, _ = tracker.update([detection(64, 10, 164, 110)], frame_index=1)[0]
    assert recent_track.track_id == first_track.track_id

    stale_tracker = IoUTracker(iou_threshold=0.3, max_age=10)
    stale_first, _ = stale_tracker.update(
        [detection(10, 10, 110, 110)], frame_index=0
    )[0]
    stale_track, _ = stale_tracker.update(
        [detection(64, 10, 164, 110)], frame_index=5
    )[0]
    assert stale_track.track_id != stale_first.track_id
