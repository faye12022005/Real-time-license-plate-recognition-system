"""Vietnamese license plate validation and formatting utilities.

Supports standard formats according to Circular 24/2023/TT-BCA and 58/2020/TT-BCA:
- Car 1-line plate: e.g. 30A-123.45, 51K-987.65
- Motorcycle 2-line plate: e.g. 29-H1 123.45, 59-X3 7890
- Legacy 4-digit plates: e.g. 29A-1234, 51-P3 4567
"""

import re
from typing import Optional, Tuple

# Regex patterns for Vietnamese plates
REGEX_CAR_5_DIGIT = re.compile(r"^([1-9][0-9])([A-Z]{1,2})[- ]?([0-9]{3})[.]?([0-9]{2})$")
REGEX_CAR_4_DIGIT = re.compile(r"^([1-9][0-9])([A-Z]{1,2})[- ]?([0-9]{4})$")
REGEX_MOTO_5_DIGIT = re.compile(r"^([1-9][0-9])[- ]?([A-Z][0-9]|[A-Z]{2})[- ]?([0-9]{3})[.]?([0-9]{2})$")
REGEX_MOTO_4_DIGIT = re.compile(r"^([1-9][0-9])[- ]?([A-Z][0-9]|[A-Z]{2})[- ]?([0-9]{4})$")


def normalize_plate(plate: str) -> str:
    """Remove hyphens, dots, spaces and uppercase."""
    if not plate:
        return ""
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


def is_valid_plate(plate: str) -> bool:
    """Basic Vietnamese plate format check."""
    norm = normalize_plate(plate)
    return bool(re.match(r"^\d{2}[A-Z0-9]+$", norm)) and len(norm) >= 5


def clean_raw_plate_text(raw_text: str) -> str:
    """Normalize raw OCR text by stripping invalid characters and whitespace."""
    if not raw_text:
        return ""
    text = raw_text.strip().upper()
    text = re.sub(r"[^A-Z0-9.\-\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def format_vietnamese_plate(cleaned_text: str) -> str:
    """Standardize plate formatting with standard hyphens and dots."""
    compact = normalize_plate(cleaned_text)

    # 5-digit car: 2 digits + 1-2 letters + 5 digits
    m_car5 = re.match(r"^([1-9][0-9])([A-Z]{1,2})([0-9]{3})([0-9]{2})$", compact)
    if m_car5:
        return f"{m_car5.group(1)}{m_car5.group(2)}-{m_car5.group(3)}.{m_car5.group(4)}"

    # 4-digit car
    m_car4 = re.match(r"^([1-9][0-9])([A-Z]{1,2})([0-9]{4})$", compact)
    if m_car4:
        return f"{m_car4.group(1)}{m_car4.group(2)}-{m_car4.group(3)}"

    # 5-digit motorcycle: 2 digits + (1 letter + 1 digit OR 2 letters) + 5 digits
    m_moto5 = re.match(r"^([1-9][0-9])([A-Z][0-9]|[A-Z]{2})([0-9]{3})([0-9]{2})$", compact)
    if m_moto5:
        return f"{m_moto5.group(1)}-{m_moto5.group(2)} {m_moto5.group(3)}.{m_moto5.group(4)}"

    # 4-digit motorcycle
    m_moto4 = re.match(r"^([1-9][0-9])([A-Z][0-9]|[A-Z]{2})([0-9]{4})$", compact)
    if m_moto4:
        return f"{m_moto4.group(1)}-{m_moto4.group(2)} {m_moto4.group(3)}"

    return cleaned_text


def validate_plate_number(plate_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Validate whether the text matches a valid Vietnamese license plate structure."""
    cleaned = clean_raw_plate_text(plate_text)
    formatted = format_vietnamese_plate(cleaned)

    if REGEX_CAR_5_DIGIT.match(formatted) or REGEX_CAR_4_DIGIT.match(formatted):
        return True, formatted, "car"

    if REGEX_MOTO_5_DIGIT.match(formatted) or REGEX_MOTO_4_DIGIT.match(formatted):
        return True, formatted, "motorcycle"

    is_valid = is_valid_plate(plate_text)
    return is_valid, formatted if is_valid else None, "car" if is_valid else None
