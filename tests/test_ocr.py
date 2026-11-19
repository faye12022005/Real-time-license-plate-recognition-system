"""Tests for license plate OCR post-processing."""

from __future__ import annotations

from src.core.ocr import (
    PlateOCR,
    filter_small_text_segments,
    sort_detections_reading_order,
    suppress_overlapping_detections,
)
from src.models import Detection, OCRResult
from src.utils.plate_validator import (
    canonicalize_plate,
    format_plate,
    is_valid_plate,
    normalize_text,
    province_name,
)


def detection(x1: int, y1: int, x2: int, y2: int, name: str) -> Detection:
    return Detection(
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        confidence=0.9,
        class_id=ord(name[0]) if name else 0,
        class_name=name,
    )


def test_normalize_text() -> None:
    assert normalize_text("51f-882.34") == "51F88234"
    assert normalize_text(" 59P2 998.11 ") == "59P299811"


def test_canonicalize_common_confusions() -> None:
    assert canonicalize_plate("5IF88234") == "51F88234"
    assert canonicalize_plate("S1F88234") == "51F88234"
    assert canonicalize_plate("59P2998I1") == "59P299811"


def test_is_valid_plate() -> None:
    assert is_valid_plate("51F88234")
    assert is_valid_plate("59P299811")
    assert not is_valid_plate("HELLO")
    assert not is_valid_plate("51F88")
    assert not is_valid_plate("30MHN38206")
    assert not is_valid_plate("29I162299")


def test_format_plate() -> None:
    assert format_plate("51F88234") == "51F-882.34"
    assert format_plate("59P299811") == "59P2-998.11"


def test_province_name() -> None:
    assert province_name("51F88234") == "TP. Hồ Chí Minh"
    assert province_name("29A12345") == "TP. Hà Nội"
    assert province_name("99A12345") == "Bắc Ninh"


def test_sort_detections_reading_order_two_rows() -> None:
    detections = [
        detection(50, 10, 70, 30, "B"),
        detection(10, 10, 30, 30, "A"),
        detection(10, 50, 30, 70, "C"),
    ]
    ordered = sort_detections_reading_order(detections)
    assert [item.class_name for item in ordered] == ["A", "B", "C"]


def test_suppress_overlapping_detections_keeps_best_class() -> None:
    detections = [
        Detection(10, 10, 30, 60, 0.46, 1, "M"),
        Detection(10, 10, 30, 60, 0.29, 2, "H"),
        Detection(10, 10, 30, 60, 0.69, 3, "N"),
        Detection(40, 10, 60, 60, 0.80, 4, "3"),
    ]
    kept = suppress_overlapping_detections(detections)
    assert [item.class_name for item in kept] == ["3", "N"]


def test_filter_small_text_segments_drops_dash_artifacts() -> None:
    segments = [
        ([[63, 73], [153, 73], [153, 163], [63, 163]], "17", 0.99),
        ([[146, 94], [172, 94], [172, 131], [146, 131]], "5", 0.51),
        ([[167, 51], [260, 51], [260, 143], [167, 143]], "F2", 0.55),
        ([[75, 161], [269, 125], [279, 216], [86, 253]], "1618", 1.0),
    ]
    filtered = filter_small_text_segments(segments)
    assert [text for _, text, _ in filtered] == ["17", "F2", "1618"]


def test_fusion_prefers_shorter_subsequence() -> None:
    easy = OCRResult(text="30N38206", confidence=0.71, source="easyocr")
    char = OCRResult(
        text="30MN38206",
        confidence=0.73,
        source="char_az",
        letters="MN",
    )
    fused = PlateOCR._fuse(easy, char)
    assert fused.text == "30N38206"
    assert is_valid_plate(fused.text)


def test_fusion_inserts_missing_series_letter() -> None:
    easy = OCRResult(text="5188234", confidence=0.8, source="easyocr")
    char = OCRResult(text="F", confidence=0.95, source="char_az", letters="F")
    fused = PlateOCR._fuse(easy, char)
    assert fused.text == "51F88234"
    assert fused.source == "hybrid"
    assert is_valid_plate(fused.text)


def test_fusion_keeps_valid_easyocr_result() -> None:
    easy = OCRResult(text="51F88234", confidence=0.9, source="easyocr")
    char = OCRResult(text="F", confidence=0.9, source="char_az", letters="F")
    fused = PlateOCR._fuse(easy, char)
    assert fused.text == "51F88234"
    assert fused.source == "hybrid"


def test_fusion_prefers_confident_character_detector() -> None:
    easy = OCRResult(text="51F88235", confidence=0.8, source="easyocr")
    char = OCRResult(
        text="51F88234",
        confidence=0.9,
        source="char_az",
        letters="F",
    )
    fused = PlateOCR._fuse(easy, char)
    assert fused.text == "51F88234"
    assert fused.confidence >= 0.9
