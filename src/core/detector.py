"""License plate detector module based on YOLO (Ultralytics).

Detects 1-line and 2-line license plates on vehicle images/video streams,
extracts bounding boxes, and crops Regions of Interest (ROI) for OCR.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple
import cv2  # type: ignore
import numpy as np  # type: ignore

from config.settings import (
    CLASS_NAMES,
    DETECTOR_CONF_THRESHOLD,
    DETECTOR_DEVICE,
    DETECTOR_IOU_THRESHOLD,
    DETECTOR_MODEL_PATH,
    PLATE_CROP_PADDING,
)
from src.utils.image_processing import crop_plate_roi


@dataclass
class PlateDetection:
    """Represents a single detected license plate."""

    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    confidence: float
    class_id: int
    class_name: str
    cropped_roi: np.ndarray


class PlateDetector:
    """YOLO-based license plate detector."""

    def __init__(
        self,
        model_path: Optional[Path] = None,
        conf_thresh: float = DETECTOR_CONF_THRESHOLD,
        iou_thresh: float = DETECTOR_IOU_THRESHOLD,
        device: str = DETECTOR_DEVICE,
    ) -> None:
        self.model_path = Path(model_path or DETECTOR_MODEL_PATH)
        self.conf_thresh = conf_thresh
        self.iou_thresh = iou_thresh
        self.device = device
        self.model = None

        self._load_model()

    def _load_model(self) -> None:
        """Load YOLO model weights if available."""
        if not self.model_path.is_file():
            print(
                f"[PlateDetector] [WARN] Weight file not found at '{self.model_path}'. "
                "Detector will run in stub/pass-through mode until weights are placed."
            )
            return

        try:
            import importlib

            ultralytics = importlib.import_module("ultralytics")  # type: ignore
            YOLO = getattr(ultralytics, "YOLO")

            self.model = YOLO(str(self.model_path))
            print(f"[PlateDetector] [INFO] Loaded YOLO plate detector from '{self.model_path}'.")
        except (ImportError, ModuleNotFoundError):
            print("[PlateDetector] [ERROR] 'ultralytics' package not installed. Run 'pip install ultralytics'.")
        except Exception as e:
            print(f"[PlateDetector] [ERROR] Failed to load YOLO model: {e}")

    def is_ready(self) -> bool:
        """Return True if model is loaded and ready for inference."""
        return self.model is not None

    def detect(self, frame: np.ndarray) -> List[PlateDetection]:
        """Detect license plates in an image frame.

        Args:
            frame: Input image (BGR format).

        Returns:
            List of PlateDetection objects with bounding boxes and cropped ROIs.
        """
        if frame is None or frame.size == 0:
            return []

        if not self.is_ready():
            return []

        results = self.model.predict(
            source=frame,
            conf=self.conf_thresh,
            iou=self.iou_thresh,
            device=self.device,
            verbose=False,
        )

        detections: List[PlateDetection] = []
        if not results:
            return detections

        r = results[0]
        boxes = r.boxes
        if boxes is None or len(boxes) == 0:
            return detections

        for box in boxes:
            coords = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = [int(v) for v in coords]
            conf = float(box.conf[0].cpu().numpy())
            cls_id = int(box.cls[0].cpu().numpy())
            cls_name = CLASS_NAMES.get(cls_id, f"plate_{cls_id}")

            roi = crop_plate_roi(frame, (x1, y1, x2, y2), padding=PLATE_CROP_PADDING)

            detections.append(
                PlateDetection(
                    bbox=(x1, y1, x2, y2),
                    confidence=conf,
                    class_id=cls_id,
                    class_name=cls_name,
                    cropped_roi=roi,
                )
            )

        return detections

    def draw_detections(
        self,
        frame: np.ndarray,
        detections: List[PlateDetection],
        draw_labels: bool = True,
    ) -> np.ndarray:
        """Draw bounding boxes and class labels onto frame for debugging/visualization."""
        annotated = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = det.bbox
            color = (0, 255, 0) if det.class_id == 0 else (0, 165, 255)  # Green for 1-line, Orange for 2-line

            # Draw rectangle
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            if draw_labels:
                label = f"{det.class_name}: {det.confidence:.2f}"
                cv2.putText(
                    annotated,
                    label,
                    (x1, max(20, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    2,
                )
        return annotated
