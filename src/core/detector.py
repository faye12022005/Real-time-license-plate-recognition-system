"""License plate and vehicle detection using Ultralytics YOLO models."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Optional, Sequence

import numpy as np

from config.settings import VEHICLE_TYPE_MAP
from src.models import Detection
from src.utils.logger import get_logger

LOGGER = get_logger(__name__)


class YoloDetector:
    """Thin wrapper around an Ultralytics YOLO detection model."""

    def __init__(
        self,
        model_path: str | Path,
        confidence: float = 0.25,
        iou: float = 0.5,
        imgsz: int = 640,
        device: Optional[str] = None,
    ) -> None:
        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"Model not found: {self.model_path}. "
                "Copy the trained .pt file into data/models/ or pass --models-dir."
            )

        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise ImportError(
                "ultralytics is required to run detection. Install dependencies with "
                "'pip install -r requirements.txt'."
            ) from exc

        self.confidence = float(confidence)
        self.iou = float(iou)
        self.imgsz = int(imgsz)
        self.device = device
        self.model = YOLO(str(self.model_path))
        self.names = self._resolve_names()

    def _resolve_names(self) -> dict[int, str]:
        names = getattr(self.model, "names", {}) or {}
        if isinstance(names, list):
            return {index: str(name) for index, name in enumerate(names)}
        return {int(index): str(name) for index, name in names.items()}

    def predict(
        self,
        image: np.ndarray,
        confidence: Optional[float] = None,
        classes: Optional[Sequence[int]] = None,
    ) -> list[Detection]:
        """Run inference on a BGR image."""
        if image is None or image.size == 0:
            return []

        results = self.model.predict(
            source=image,
            conf=self.confidence if confidence is None else float(confidence),
            iou=self.iou,
            imgsz=self.imgsz,
            device=self.device,
            classes=list(classes) if classes is not None else None,
            verbose=False,
        )
        if not results:
            return []

        result = results[0]
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return []

        xyxy = boxes.xyxy.cpu().numpy()
        confidences = boxes.conf.cpu().numpy()
        class_ids = boxes.cls.cpu().numpy().astype(int)

        detections: list[Detection] = []
        for (x1, y1, x2, y2), confidence_value, class_id in zip(xyxy, confidences, class_ids):
            class_name = self.names.get(int(class_id), str(class_id))
            detections.append(
                Detection(
                    x1=int(round(x1)),
                    y1=int(round(y1)),
                    x2=int(round(x2)),
                    y2=int(round(y2)),
                    confidence=float(confidence_value),
                    class_id=int(class_id),
                    class_name=class_name,
                )
            )
        return detections


class PlateDetector(YoloDetector):
    """Detector trained on the single `license_plate` class."""


class VehicleDetector(YoloDetector):
    """Detector trained on vehicle classes (car, motorbike, bus, truck...)."""


def map_vehicle_type(class_name: str) -> str:
    """Map dataset class names to the API contract vehicle types."""
    return VEHICLE_TYPE_MAP.get((class_name or "").lower(), "car")


def _intersection_area(first: Detection, second: Detection) -> int:
    x1 = max(first.x1, second.x1)
    y1 = max(first.y1, second.y1)
    x2 = min(first.x2, second.x2)
    y2 = min(first.y2, second.y2)
    if x2 <= x1 or y2 <= y1:
        return 0
    return (x2 - x1) * (y2 - y1)


def _iou(first: Detection, second: Detection) -> float:
    intersection = _intersection_area(first, second)
    if intersection == 0:
        return 0.0
    union = first.area + second.area - intersection
    return intersection / float(union) if union > 0 else 0.0


def select_vehicle_for_plate(
    plate: Detection,
    vehicles: Iterable[Detection],
) -> Optional[Detection]:
    """Pick the vehicle that most likely contains the given plate."""
    vehicle_list = list(vehicles)
    if not vehicle_list:
        return None

    center_x, center_y = plate.center
    containing = [
        vehicle
        for vehicle in vehicle_list
        if vehicle.x1 <= center_x <= vehicle.x2 and vehicle.y1 <= center_y <= vehicle.y2
    ]
    if containing:
        return min(containing, key=lambda vehicle: vehicle.area)

    best_iou = 0.0
    best_vehicle: Optional[Detection] = None
    for vehicle in vehicle_list:
        value = _iou(plate, vehicle)
        if value > best_iou:
            best_iou = value
            best_vehicle = vehicle
    if best_vehicle is not None and best_iou >= 0.05:
        return best_vehicle

    return min(
        vehicle_list,
        key=lambda vehicle: (
            (vehicle.center[0] - center_x) ** 2 + (vehicle.center[1] - center_y) ** 2
        ),
    )
