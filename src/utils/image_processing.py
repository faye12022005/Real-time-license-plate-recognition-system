"""Image processing utilities for license plate recognition."""

from typing import Tuple
import cv2  # type: ignore
import numpy as np  # type: ignore


def crop_plate_roi(
    image: np.ndarray,
    bbox: Tuple[int, int, int, int],
    padding: int = 10,
) -> np.ndarray:
    """Crop a Region of Interest around a plate bbox with padding.

    Args:
        image: Source RGB or BGR image (H, W, C).
        bbox: Bounding box tuple (x1, y1, x2, y2).
        padding: Pixel padding added around bounding box.

    Returns:
        Cropped image slice containing the license plate.
    """
    if image is None or image.size == 0:
        return np.zeros((10, 10, 3), dtype=np.uint8)

    h, w = image.shape[:2]
    x1, y1, x2, y2 = bbox

    # Apply padding with boundary clipping
    x1 = max(0, int(x1) - padding)
    y1 = max(0, int(y1) - padding)
    x2 = min(w, int(x2) + padding)
    y2 = min(h, int(y2) + padding)

    if x2 <= x1 or y2 <= y1:
        return np.zeros((10, 10, 3), dtype=np.uint8)

    return image[y1:y2, x1:x2].copy()


def enhance_plate_contrast(image: np.ndarray) -> np.ndarray:
    """Enhance contrast of cropped license plate using CLAHE.

    Args:
        image: Cropped plate image (BGR).

    Returns:
        Contrast-enhanced image (BGR).
    """
    if image is None or image.size == 0:
        return image

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)

    enhanced_lab = cv2.merge((cl, a, b))
    return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)


def deskew_plate(image: np.ndarray, max_angle: float = 30.0) -> np.ndarray:
    """Correct slight rotation / skew in license plate images.

    Args:
        image: License plate BGR image.
        max_angle: Maximum allowable angle correction in degrees.

    Returns:
        Deskewed plate image.
    """
    if image is None or image.size == 0:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=40, minLineLength=30, maxLineGap=10)

    if lines is None:
        return image

    angles = []
    for line in lines:
        pts = np.asarray(line).ravel()
        if len(pts) < 4:
            continue
        x1, y1, x2, y2 = pts[:4]
        if x2 - x1 == 0:
            continue
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) < max_angle:
            angles.append(angle)

    if not angles:
        return image

    median_angle = float(np.median(angles))
    if abs(median_angle) < 1.0:
        return image

    (h, w) = image.shape[:2]
    center = (w // 2, h // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    rotated = cv2.warpAffine(
        image,
        rotation_matrix,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return rotated


def draw_bbox(
    frame: np.ndarray,
    bbox: Tuple[int, int, int, int],
    label: str = "",
    color: Tuple[int, int, int] = (0, 255, 0),
) -> np.ndarray:
    """Draw bounding box + label on frame."""
    annotated = frame.copy()
    x1, y1, x2, y2 = bbox
    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
    if label:
        cv2.putText(
            annotated,
            label,
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )
    return annotated
