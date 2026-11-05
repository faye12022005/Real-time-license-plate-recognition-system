"""Unit tests for license plate detector and validator."""

import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np  # type: ignore
from src.core.detector import PlateDetection, PlateDetector
from src.utils.image_processing import crop_plate_roi
from src.utils.plate_validator import clean_raw_plate_text, format_vietnamese_plate, validate_plate_number


def test_plate_validator_car() -> None:
    # 5-digit car plates
    is_valid, formatted, vtype = validate_plate_number("30A12345")
    assert is_valid is True
    assert formatted == "30A-123.45"
    assert vtype == "car"

    is_valid, formatted, vtype = validate_plate_number("51K-987.65")
    assert is_valid is True
    assert formatted == "51K-987.65"
    assert vtype == "car"


def test_plate_validator_motorcycle() -> None:
    # 5-digit motorcycle plates
    is_valid, formatted, vtype = validate_plate_number("29G1 12345")
    assert is_valid is True
    assert formatted == "29-G1 123.45"
    assert vtype == "motorcycle"

    is_valid, formatted, vtype = validate_plate_number("59-X2 888.88")
    assert is_valid is True
    assert formatted == "59-X2 888.88"
    assert vtype == "motorcycle"


def test_crop_plate_roi() -> None:
    # Dummy frame 100x100
    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    cropped = crop_plate_roi(dummy_frame, (10, 10, 50, 40), padding=2)
    assert cropped.shape[0] > 0
    assert cropped.shape[1] > 0


def test_detector_initialization() -> None:
    detector = PlateDetector()
    assert isinstance(detector.is_ready(), bool)
    detections = detector.detect(np.zeros((100, 100, 3), dtype=np.uint8))
    assert detections == []


if __name__ == "__main__":
    test_plate_validator_car()
    test_plate_validator_motorcycle()
    test_crop_plate_roi()
    test_detector_initialization()
    print("[SUCCESS] All tests passed!")
