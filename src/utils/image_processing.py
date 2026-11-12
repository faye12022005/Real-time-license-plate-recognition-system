"""Image preprocessing and drawing helpers."""

from __future__ import annotations

from typing import Iterable, Sequence, Tuple

import cv2
import numpy as np

from src.models import Detection

BBox = Tuple[int, int, int, int]


def clamp_bbox(bbox: BBox, width: int, height: int) -> BBox:
    """Clamp a bounding box to the image bounds."""
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(int(x1), width - 1))
    y1 = max(0, min(int(y1), height - 1))
    x2 = max(0, min(int(x2), width))
    y2 = max(0, min(int(y2), height))
    if x2 <= x1 or y2 <= y1:
        return 0, 0, 0, 0
    return x1, y1, x2, y2


def crop_with_padding(
    image: np.ndarray,
    bbox: BBox,
    pad_ratio: float = 0.12,
) -> np.ndarray:
    """Crop a region with relative padding, clamped to image bounds."""
    height, width = image.shape[:2]
    x1, y1, x2, y2 = bbox
    box_w = max(1, x2 - x1)
    box_h = max(1, y2 - y1)
    pad_x = int(round(box_w * pad_ratio))
    pad_y = int(round(box_h * pad_ratio))
    padded = (x1 - pad_x, y1 - pad_y, x2 + pad_x, y2 + pad_y)
    x1, y1, x2, y2 = clamp_bbox(padded, width, height)
    if x2 <= x1 or y2 <= y1:
        return image[0:1, 0:1].copy()
    return image[y1:y2, x1:x2].copy()


def resize_min_width(image: np.ndarray, min_width: int = 320, max_scale: float = 3.0) -> np.ndarray:
    """Upscale small crops so OCR models have enough pixels to work with."""
    height, width = image.shape[:2]
    if width == 0 or height == 0 or width >= min_width:
        return image
    scale = min(max_scale, min_width / float(width))
    if scale <= 1.0:
        return image
    return cv2.resize(
        image,
        (int(round(width * scale)), int(round(height * scale))),
        interpolation=cv2.INTER_CUBIC,
    )


def enhance_contrast(image: np.ndarray) -> np.ndarray:
    """Apply CLAHE on the luminance channel to improve character contrast."""
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    return cv2.cvtColor(cv2.merge((l_channel, a_channel, b_channel)), cv2.COLOR_LAB2BGR)


def prepare_ocr_variants(crop: np.ndarray, min_width: int = 320) -> list[np.ndarray]:
    """Return upscaled and contrast-enhanced variants of a plate crop."""
    base = resize_min_width(crop, min_width=min_width)
    enhanced = enhance_contrast(base)
    return [base, enhanced]


def laplacian_sharpness(image: np.ndarray) -> float:
    """Return the variance of the Laplacian (higher means sharper)."""
    if image.size == 0:
        return 0.0
    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def quality_score(image: np.ndarray) -> float:
    """Estimate image quality in the 0..1 range from sharpness, size and contrast."""
    if image.size == 0:
        return 0.0
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    sharpness = laplacian_sharpness(gray)
    sharp_score = min(1.0, sharpness / 500.0)
    height, width = gray.shape[:2]
    resolution_score = min(1.0, min(width, height) / 160.0)
    contrast_score = min(1.0, float(gray.std()) / 60.0)
    score = 0.5 * sharp_score + 0.3 * resolution_score + 0.2 * contrast_score
    return float(max(0.0, min(1.0, score)))


def estimate_plate_color(crop: np.ndarray) -> str:
    """Estimate the dominant license plate background color."""
    if crop.size == 0:
        return "white"
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hue = float(np.median(hsv[:, :, 0]))
    saturation = float(np.median(hsv[:, :, 1]))
    value = float(np.median(hsv[:, :, 2]))

    if saturation < 45 and value > 110:
        return "white"
    if 12 <= hue <= 40 and saturation >= 60:
        return "yellow"
    if 85 <= hue <= 135 and saturation >= 60:
        return "blue"
    if (hue <= 10 or hue >= 160) and saturation >= 70:
        return "red"
    return "white"


def format_seconds(seconds: float) -> str:
    """Format seconds as mm:ss."""
    seconds = max(0.0, float(seconds))
    return f"{int(seconds // 60):02d}:{int(seconds % 60):02d}"


def draw_detections(
    image: np.ndarray,
    detections: Iterable[Detection],
    color: tuple[int, int, int] = (0, 255, 0),
    label: bool = True,
) -> np.ndarray:
    """Draw detections on a copy of the image."""
    output = image.copy()
    for detection in detections:
        x1, y1, x2, y2 = detection.bbox
        cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
        if label:
            text = f"{detection.class_name} {detection.confidence:.2f}"
            (tw, th), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(output, (x1, max(0, y1 - th - baseline - 4)), (x1 + tw + 4, y1), color, -1)
            cv2.putText(
                output,
                text,
                (x1 + 2, max(th + 2, y1 - baseline - 2)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )
    return output


def draw_plate_label(
    image: np.ndarray,
    bbox: BBox,
    text: str,
    confidence: float,
    color: tuple[int, int, int] = (0, 200, 255),
) -> None:
    """Draw a plate box and label directly onto an image."""
    x1, y1, x2, y2 = bbox
    cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
    label = f"{text} ({confidence:.2f})"
    (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
    top = max(0, y1 - th - baseline - 6)
    cv2.rectangle(image, (x1, top), (x1 + tw + 6, y1), color, -1)
    cv2.putText(
        image,
        label,
        (x1 + 3, max(th + 2, y1 - baseline - 3)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (0, 0, 0),
        2,
        cv2.LINE_AA,
    )


def ensure_odd(value: int) -> int:
    """Return the nearest odd integer >= 3 (useful for Gaussian kernels)."""
    value = max(3, int(value))
    return value if value % 2 == 1 else value + 1


def normalize_image_for_display(images: Sequence[np.ndarray]) -> list[np.ndarray]:
    """Ensure every image is a writable three-channel uint8 image."""
    normalized: list[np.ndarray] = []
    for image in images:
        if image.dtype != np.uint8:
            image = np.clip(image, 0, 255).astype(np.uint8)
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        normalized.append(image)
    return normalized
