"""Vehicle and license plate tracking across video frames (IoU-based tracker)."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import numpy as np  # type: ignore

from src.core.detector import PlateDetection


@dataclass
class TrackedPlate:
    """Represents a tracked vehicle/plate across multiple frames."""

    track_id: int
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    class_id: int
    class_name: str
    best_roi: np.ndarray
    best_confidence: float
    hits: int = 1
    time_since_update: int = 0
    plate_text: Optional[str] = None
    plate_display: Optional[str] = None


def calculate_iou(boxA: Tuple[int, int, int, int], boxB: Tuple[int, int, int, int]) -> float:
    """Calculate Intersection over Union (IoU) of two bounding boxes."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0, xB - xA)
    inter_h = max(0, yB - yA)
    inter_area = inter_w * inter_h

    boxA_area = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxB_area = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    union_area = boxA_area + boxB_area - inter_area

    if union_area <= 0:
        return 0.0

    return float(inter_area) / float(union_area)


class VehicleTracker:
    """Multi-object IoU tracker for vehicle license plates."""

    def __init__(self, iou_threshold: float = 0.3, max_age: int = 15) -> None:
        self.iou_threshold = iou_threshold
        self.max_age = max_age
        self.tracks: Dict[int, TrackedPlate] = {}
        self.next_id: int = 1

    def update(self, detections: List[PlateDetection]) -> List[TrackedPlate]:
        """Update tracker with detections from current frame."""
        # Age all current tracks
        for track in self.tracks.values():
            track.time_since_update += 1

        matched_tracks = set()
        matched_dets = set()

        # Match detections to existing tracks via IoU
        if self.tracks and detections:
            track_ids = list(self.tracks.keys())
            iou_matrix = np.zeros((len(track_ids), len(detections)), dtype=np.float32)

            for i, tid in enumerate(track_ids):
                for j, det in enumerate(detections):
                    iou_matrix[i, j] = calculate_iou(self.tracks[tid].bbox, det.bbox)

            # Greedy matching by maximum IoU
            while True:
                max_iou = np.max(iou_matrix)
                if max_iou < self.iou_threshold:
                    break

                i, j = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
                tid = track_ids[i]
                det = detections[j]

                # Update matched track
                track = self.tracks[tid]
                track.bbox = det.bbox
                track.time_since_update = 0
                track.hits += 1

                # Update best ROI if detection confidence is higher
                if det.confidence > track.best_confidence:
                    track.best_confidence = det.confidence
                    track.best_roi = det.cropped_roi

                matched_tracks.add(tid)
                matched_dets.add(j)

                # Zero out row and column
                iou_matrix[i, :] = -1
                iou_matrix[:, j] = -1

        # Create new tracks for unmatched detections
        for j, det in enumerate(detections):
            if j not in matched_dets:
                new_track = TrackedPlate(
                    track_id=self.next_id,
                    bbox=det.bbox,
                    class_id=det.class_id,
                    class_name=det.class_name,
                    best_roi=det.cropped_roi,
                    best_confidence=det.confidence,
                )
                self.tracks[self.next_id] = new_track
                self.next_id += 1

        # Delete expired tracks
        dead_ids = [tid for tid, t in self.tracks.items() if t.time_since_update > self.max_age]
        for tid in dead_ids:
            del self.tracks[tid]

        # Return tracks seen in current frame
        return [t for t in self.tracks.values() if t.time_since_update == 0]

    def reset(self) -> None:
        """Reset tracking state."""
        self.tracks.clear()
        self.next_id = 1

    def process(self, plate_text: str) -> None:
        """Mark or update tracking state for plate string."""
        pass
