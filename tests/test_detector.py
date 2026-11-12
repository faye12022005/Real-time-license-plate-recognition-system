"""Tests for license plate detection helpers."""

from __future__ import annotations

import numpy as np

from src.core.detector import map_vehicle_type, select_vehicle_for_plate
from src.models import Detection
from src.utils.image_processing import crop_with_padding


def detection(x1: int, y1: int, x2: int, y2: int, name: str = "car", conf: float = 0.9) -> Detection:
    return Detection(
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        confidence=conf,
        class_id=0,
        class_name=name,
    )


def test_detection_geometry() -> None:
    box = detection(10, 20, 40, 60)
    assert box.width == 30
    assert box.height == 40
    assert box.area == 1200
    assert box.center == (25.0, 40.0)


def test_map_vehicle_type() -> None:
    assert map_vehicle_type("motorbike") == "motorcycle"
    assert map_vehicle_type("bicycle") == "motorcycle"
    assert map_vehicle_type("van") == "car"
    assert map_vehicle_type("truck") == "truck"
    assert map_vehicle_type("unknown") == "car"


def test_select_vehicle_prefers_smallest_containing_box() -> None:
    plate = detection(100, 100, 140, 120, name="license_plate")
    big_car = detection(0, 0, 400, 300, name="car")
    small_car = detection(80, 80, 180, 150, name="car")

    selected = select_vehicle_for_plate(plate, [big_car, small_car])
    assert selected is small_car


def test_select_vehicle_returns_none_without_vehicles() -> None:
    plate = detection(100, 100, 140, 120, name="license_plate")
    assert select_vehicle_for_plate(plate, []) is None


def test_crop_with_padding_and_clamping() -> None:
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    crop = crop_with_padding(image, (10, 10, 30, 30), pad_ratio=0.5)
    assert crop.shape[:2] == (40, 40)

    clamped = crop_with_padding(image, (0, 0, 10, 10), pad_ratio=1.0)
    assert clamped.shape[:2] == (20, 20)
