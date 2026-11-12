"""Optical character recognition for license plates.

The pipeline combines two complementary sources:

* EasyOCR reads the complete alphanumeric plate (letters and digits).
* The trained YOLO character detector recognises each plate character
  (classes 0-9 and A-Z) and is used to confirm or repair the reading.

If EasyOCR is unavailable, the character detector is used as a fallback.
"""

from __future__ import annotations

import statistics
from pathlib import Path
from typing import Iterable, Optional

import numpy as np

from config.settings import CHAR_CONFIDENCE, OCR_ALPHABET
from src.core.detector import YoloDetector
from src.models import Detection, OCRResult
from src.utils.image_processing import prepare_ocr_variants
from src.utils.logger import get_logger
from src.utils.plate_validator import (
    canonicalize_plate,
    is_valid_plate,
    normalize_text,
    plate_series,
)

LOGGER = get_logger(__name__)


def _series_of(plate: str) -> str:
    return plate_series(plate)


def _is_subsequence(shorter: str, longer: str) -> bool:
    """Return True if every character of `shorter` appears in order in `longer`."""
    iterator = iter(longer)
    return all(character in iterator for character in shorter)


def _box_iou(first: Detection, second: Detection) -> float:
    x1 = max(first.x1, second.x1)
    y1 = max(first.y1, second.y1)
    x2 = min(first.x2, second.x2)
    y2 = min(first.y2, second.y2)
    if x2 <= x1 or y2 <= y1:
        return 0.0
    intersection = (x2 - x1) * (y2 - y1)
    union = first.area + second.area - intersection
    return intersection / float(union) if union > 0 else 0.0


def suppress_overlapping_detections(
    detections: Iterable[Detection],
    iou_threshold: float = 0.30,
) -> list[Detection]:
    """Keep the most confident box for each physical character.

    Ultralytics NMS is class-aware, so one character can survive several times
    with different class labels (for example N, M and H at the same position).
    Character reading must suppress those duplicates regardless of class.
    """
    kept: list[Detection] = []
    for detection in sorted(
        detections, key=lambda item: item.confidence, reverse=True
    ):
        if all(_box_iou(detection, other) < iou_threshold for other in kept):
            kept.append(detection)
    return kept


def filter_small_text_segments(
    segments: list[tuple[list[list[float]], str, float]],
    min_height_ratio: float = 0.55,
) -> list[tuple[list[list[float]], str, float]]:
    """Drop EasyOCR segments that only cover punctuation such as the plate dash.

    A separator is much shorter than a real character, so its box height is
    clearly below the median line height. Keeping it would insert a phantom
    digit or letter (for example `17-F2` being read as `175F2`).
    """
    if len(segments) <= 1:
        return segments

    heights = [max(point[1] for point in box) - min(point[1] for point in box) for box, _, _ in segments]
    median_height = statistics.median(heights)
    threshold = max(6.0, median_height * min_height_ratio)
    filtered = [
        segment
        for segment, height in zip(segments, heights)
        if height >= threshold
    ]
    return filtered or segments


def sort_detections_reading_order(detections: Iterable[Detection]) -> list[Detection]:
    """Sort character boxes top-to-bottom, then left-to-right within each row."""
    items = list(detections)
    if not items:
        return []

    heights = [item.height for item in items if item.height > 0]
    median_height = statistics.median(heights) if heights else 10
    row_threshold = max(8.0, median_height * 0.65)

    rows: list[list[Detection]] = []
    current_row: list[Detection] = []
    current_center_y: Optional[float] = None

    for item in sorted(items, key=lambda detection: detection.center[1]):
        center_y = item.center[1]
        if current_center_y is None or abs(center_y - current_center_y) <= row_threshold:
            current_row.append(item)
            current_center_y = (
                center_y
                if current_center_y is None
                else (current_center_y + center_y) / 2.0
            )
        else:
            rows.append(current_row)
            current_row = [item]
            current_center_y = center_y
    if current_row:
        rows.append(current_row)

    ordered: list[Detection] = []
    for row in rows:
        ordered.extend(sorted(row, key=lambda detection: detection.x1))
    return ordered


class CharDetectorOCR:
    """OCR backed by the trained YOLO character detector (0-9, A-Z classes)."""

    def __init__(
        self,
        model_path: str | Path,
        confidence: float = CHAR_CONFIDENCE,
        imgsz: int = 640,
        device: Optional[str] = None,
    ) -> None:
        self.detector = YoloDetector(
            model_path=model_path,
            confidence=confidence,
            imgsz=imgsz,
            device=device,
        )

    def read(self, image: np.ndarray) -> OCRResult:
        detections = self.detector.predict(image, confidence=self.detector.confidence)
        characters = [
            detection
            for detection in detections
            if len(detection.class_name) == 1 and detection.class_name.isalnum()
        ]
        characters = suppress_overlapping_detections(characters)
        if not characters:
            return OCRResult(text="", confidence=0.0, source="char_az")

        ordered = sort_detections_reading_order(characters)
        text = "".join(detection.class_name.upper() for detection in ordered)
        letters = "".join(character for character in text if character.isalpha())
        confidence = float(
            statistics.fmean(detection.confidence for detection in ordered)
        )
        return OCRResult(
            text=text,
            confidence=confidence,
            source="char_az",
            raw_text=text,
            letters=letters,
        )


class EasyOCRReader:
    """Lazy wrapper around EasyOCR's English (alphanumeric) reader."""

    def __init__(self, gpu: bool = False, min_confidence: float = 0.20) -> None:
        try:
            import easyocr
        except ImportError as exc:
            raise ImportError(
                "easyocr is required for hybrid OCR. Install it with "
                "'pip install easyocr' or run with --ocr char."
            ) from exc

        LOGGER.info("Initialising EasyOCR (gpu=%s)", gpu)
        self.reader = easyocr.Reader(["en"], gpu=gpu, verbose=False)
        self.min_confidence = float(min_confidence)

    def read(self, image: np.ndarray) -> OCRResult:
        raw_results = self.reader.readtext(
            image,
            detail=1,
            paragraph=False,
            allowlist=OCR_ALPHABET,
            mag_ratio=1.5,
        )
        if not raw_results:
            return OCRResult(text="", confidence=0.0, source="easyocr")

        segments = [
            (box, str(text), float(confidence))
            for box, text, confidence in raw_results
            if text and confidence >= self.min_confidence
        ]
        segments = filter_small_text_segments(segments)
        if not segments:
            return OCRResult(text="", confidence=0.0, source="easyocr")

        pseudo_detections: list[Detection] = []
        texts: list[str] = []
        confidences: list[float] = []
        for box, text, confidence in segments:
            xs = [point[0] for point in box]
            ys = [point[1] for point in box]
            pseudo_detections.append(
                Detection(
                    x1=int(min(xs)),
                    y1=int(min(ys)),
                    x2=int(max(xs)),
                    y2=int(max(ys)),
                    confidence=float(confidence),
                    class_id=-1,
                    class_name=str(text),
                )
            )
            texts.append(str(text))
            confidences.append(float(confidence))

        if not pseudo_detections:
            return OCRResult(text="", confidence=0.0, source="easyocr")

        ordered = sort_detections_reading_order(pseudo_detections)
        joined = "".join(normalize_text(detection.class_name) for detection in ordered)
        total_weight = sum(max(1, len(normalize_text(text))) for text in texts)
        weighted_confidence = sum(
            confidence * max(1, len(normalize_text(text)))
            for confidence, text in zip(confidences, texts)
        ) / max(1, total_weight)
        return OCRResult(
            text=joined,
            confidence=float(weighted_confidence),
            source="easyocr",
            raw_text=" ".join(texts),
        )


class PlateOCR:
    """Hybrid plate OCR combining EasyOCR and the trained character detector."""

    def __init__(
        self,
        char_model_path: str | Path,
        mode: str = "hybrid",
        gpu: bool = False,
        char_confidence: float = CHAR_CONFIDENCE,
        imgsz: int = 640,
        device: Optional[str] = None,
    ) -> None:
        self.mode = mode
        self.char_ocr: Optional[CharDetectorOCR] = None
        self.easy_ocr: Optional[EasyOCRReader] = None

        if mode not in {"hybrid", "easyocr", "char"}:
            raise ValueError("OCR mode must be one of: hybrid, easyocr, char")

        if mode in {"hybrid", "char"}:
            self.char_ocr = CharDetectorOCR(
                model_path=char_model_path,
                confidence=char_confidence,
                imgsz=imgsz,
                device=device,
            )

        if mode in {"hybrid", "easyocr"}:
            try:
                self.easy_ocr = EasyOCRReader(gpu=gpu)
            except ImportError as exc:
                if mode == "easyocr":
                    raise
                LOGGER.warning("%s Falling back to the A-Z character detector.", exc)

    def read(self, crop: np.ndarray) -> OCRResult:
        """Read a license plate crop (BGR image)."""
        if crop is None or crop.size == 0:
            return OCRResult(text="", confidence=0.0, source="none")

        variants = prepare_ocr_variants(crop)
        easy_result = self._best_easy_result(variants)
        char_result = (
            self.char_ocr.read(variants[0]) if self.char_ocr is not None else None
        )

        if self.mode == "char":
            return char_result or OCRResult(text="", confidence=0.0, source="char_az")

        if easy_result is None or not easy_result.text:
            if char_result is not None and char_result.text:
                return char_result
            return easy_result or OCRResult(text="", confidence=0.0, source="none")

        fused = self._fuse(easy_result, char_result)
        if fused.text and not is_valid_plate(fused.text):
            canonical = canonicalize_plate(fused.text)
            if canonical:
                fused.text = canonical
        return fused

    def _best_easy_result(self, variants: list[np.ndarray]) -> Optional[OCRResult]:
        if self.easy_ocr is None:
            return None

        candidates = [self.easy_ocr.read(variant) for variant in variants]
        candidates = [candidate for candidate in candidates if candidate.text]
        if not candidates:
            return None

        return max(
            candidates,
            key=lambda result: (
                is_valid_plate(result.text),
                result.confidence,
                len(result.text),
            ),
        )

    @staticmethod
    def _fuse(easy_result: OCRResult, char_result: Optional[OCRResult]) -> OCRResult:
        easy_raw = normalize_text(easy_result.text)
        char_text = canonicalize_plate(char_result.text) if char_result is not None else ""
        letters = normalize_text(char_result.letters) if char_result is not None else ""
        if not letters and char_text:
            letters = "".join(character for character in char_text if character.isalpha())

        char_candidate: Optional[tuple[str, float, str]] = None
        if char_result is not None and is_valid_plate(char_text):
            char_candidate = (char_text, char_result.confidence, char_result.source)

        easy_candidates: list[tuple[str, float, str]] = []
        if easy_raw:
            base_candidate = canonicalize_plate(easy_raw)
            base_is_valid = is_valid_plate(base_candidate)
            observed_series_letters = any(
                character.isalpha() for character in easy_raw[2:]
            )
            if base_is_valid and observed_series_letters:
                easy_candidates.append(
                    (base_candidate, easy_result.confidence, easy_result.source)
                )
            elif letters:
                combined_confidence = 0.75 * easy_result.confidence + 0.25 * (
                    char_result.confidence if char_result else 0.0
                )
                inserted = canonicalize_plate(easy_raw[:2] + letters + easy_raw[2:])
                if is_valid_plate(inserted):
                    easy_candidates.append((inserted, combined_confidence, "hybrid"))
                if len(easy_raw) >= 8:
                    tail_start = len(easy_raw) - 5
                    replaced = canonicalize_plate(
                        easy_raw[:2] + letters + easy_raw[tail_start:]
                    )
                    if is_valid_plate(replaced):
                        easy_candidates.append((replaced, combined_confidence, "hybrid"))
                if base_is_valid and not easy_candidates:
                    easy_candidates.append(
                        (base_candidate, easy_result.confidence, easy_result.source)
                    )
            elif base_is_valid:
                easy_candidates.append(
                    (base_candidate, easy_result.confidence, easy_result.source)
                )

        if char_candidate is not None:
            char_text, char_confidence, char_source = char_candidate
            same_easy_text = any(
                candidate_text == char_text for candidate_text, _, _ in easy_candidates
            )
            if not easy_candidates:
                return OCRResult(
                    text=char_text,
                    confidence=char_confidence,
                    source=char_source,
                    raw_text=char_result.raw_text,
                    letters=letters,
                )

            if same_easy_text:
                confidence = min(
                    1.0, 0.7 * char_confidence + 0.3 * easy_result.confidence
                )
                return OCRResult(
                    text=char_text,
                    confidence=float(confidence),
                    source="hybrid",
                    raw_text=easy_result.raw_text or char_result.raw_text,
                    letters=letters,
                )

            best_easy_text, best_easy_confidence, best_easy_source = max(
                easy_candidates, key=lambda candidate: (candidate[1], len(candidate[0]))
            )

            chosen: Optional[tuple[str, float, str, str]] = None
            if _is_subsequence(char_text, best_easy_text):
                chosen = (char_text, char_confidence, char_source, "hybrid")
            elif _is_subsequence(best_easy_text, char_text):
                chosen = (
                    best_easy_text,
                    best_easy_confidence,
                    best_easy_source,
                    "hybrid",
                )
            elif _series_of(char_text) == letters and _series_of(best_easy_text) != letters:
                chosen = (char_text, char_confidence, char_source, "hybrid")
            elif _series_of(best_easy_text) == letters and _series_of(char_text) != letters:
                chosen = (
                    best_easy_text,
                    best_easy_confidence,
                    best_easy_source,
                    "hybrid",
                )
            elif (
                len(char_text) == len(best_easy_text)
                and char_confidence >= best_easy_confidence - 0.10
            ):
                chosen = (char_text, char_confidence, char_source, "hybrid")
            elif char_confidence >= best_easy_confidence + 0.15:
                chosen = (char_text, char_confidence, char_source, "hybrid")
            else:
                chosen = (
                    best_easy_text,
                    best_easy_confidence,
                    best_easy_source,
                    "hybrid",
                )

            chosen_text, chosen_confidence, chosen_source, chosen_kind = chosen
            return OCRResult(
                text=chosen_text,
                confidence=float(chosen_confidence),
                source=chosen_kind if letters else chosen_source,
                raw_text=easy_result.raw_text or char_result.raw_text,
                letters=letters,
            )

        if not easy_candidates:
            fallback = canonicalize_plate(easy_raw) or char_text
            source = easy_result.source if easy_raw else (
                char_result.source if char_result is not None else "none"
            )
            return OCRResult(
                text=fallback,
                confidence=easy_result.confidence if easy_raw else (
                    char_result.confidence if char_result is not None else 0.0
                ),
                source=source,
                raw_text=easy_result.raw_text,
                letters=letters,
            )

        preferred = [
            candidate
            for candidate in easy_candidates
            if letters and _series_of(candidate[0]) == letters
        ]
        pool = preferred or easy_candidates
        chosen_text, chosen_confidence, chosen_source = max(
            pool, key=lambda candidate: (candidate[1], len(candidate[0]))
        )
        return OCRResult(
            text=chosen_text,
            confidence=float(chosen_confidence),
            source="hybrid" if letters else chosen_source,
            raw_text=easy_result.raw_text,
            letters=letters,
        )
