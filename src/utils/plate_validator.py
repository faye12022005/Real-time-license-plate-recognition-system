"""Vietnamese license plate validation, correction and formatting."""

from __future__ import annotations

import re

PROVINCE_CODES: dict[str, str] = {
    "11": "Cao Bằng",
    "12": "Lạng Sơn",
    "13": "Bắc Giang",
    "14": "Quảng Ninh",
    "15": "Hải Phòng",
    "16": "Hải Phòng",
    "17": "Thái Bình",
    "18": "Nam Định",
    "19": "Phú Thọ",
    "20": "Thái Nguyên",
    "21": "Yên Bái",
    "22": "Tuyên Quang",
    "23": "Hà Giang",
    "24": "Lào Cai",
    "25": "Lai Châu",
    "26": "Sơn La",
    "27": "Điện Biên",
    "28": "Hòa Bình",
    "29": "TP. Hà Nội",
    "30": "TP. Hà Nội",
    "31": "TP. Hà Nội",
    "32": "TP. Hà Nội",
    "33": "TP. Hà Nội",
    "34": "TP. Hà Nội",
    "35": "Ninh Bình",
    "36": "Thanh Hóa",
    "37": "Nghệ An",
    "38": "Hà Tĩnh",
    "39": "Hưng Yên",
    "41": "TP. Hồ Chí Minh",
    "43": "TP. Đà Nẵng",
    "47": "Đắk Lắk",
    "48": "Đắk Nông",
    "49": "Lâm Đồng",
    "50": "TP. Hồ Chí Minh",
    "51": "TP. Hồ Chí Minh",
    "52": "TP. Hồ Chí Minh",
    "53": "TP. Hồ Chí Minh",
    "54": "TP. Hồ Chí Minh",
    "55": "TP. Hồ Chí Minh",
    "56": "TP. Hồ Chí Minh",
    "57": "TP. Hồ Chí Minh",
    "58": "TP. Hồ Chí Minh",
    "59": "TP. Hồ Chí Minh",
    "60": "Đồng Nai",
    "61": "Bình Dương",
    "62": "Long An",
    "63": "Tiền Giang",
    "64": "Vĩnh Long",
    "65": "TP. Cần Thơ",
    "66": "Đồng Tháp",
    "67": "An Giang",
    "68": "Kiên Giang",
    "69": "Cà Mau",
    "70": "Tây Ninh",
    "71": "Bến Tre",
    "72": "Bà Rịa - Vũng Tàu",
    "73": "Quảng Bình",
    "74": "Quảng Trị",
    "75": "TP. Huế",
    "76": "Quảng Ngãi",
    "77": "Bình Định",
    "78": "Phú Yên",
    "79": "Khánh Hòa",
    "80": "Cục Đường bộ Việt Nam",
    "81": "Gia Lai",
    "82": "Kon Tum",
    "83": "Sóc Trăng",
    "84": "Trà Vinh",
    "85": "Ninh Thuận",
    "86": "Bình Thuận",
    "88": "Vĩnh Phúc",
    "89": "Hưng Yên",
    "90": "Hà Nam",
    "92": "Quảng Nam",
    "93": "Bình Phước",
    "94": "Bạc Liêu",
    "95": "Hậu Giang",
    "97": "Bắc Kạn",
    "98": "Bắc Giang",
    "99": "Bắc Ninh",
}

LETTER_TO_DIGIT = {
    "O": "0",
    "Q": "0",
    "D": "0",
    "I": "1",
    "L": "1",
    "Z": "2",
    "S": "5",
    "B": "8",
    "G": "6",
    "T": "7",
}

DIGIT_TO_LETTER = {
    "0": "O",
    "1": "I",
    "2": "Z",
    "5": "S",
    "8": "B",
    "6": "G",
}

PLATE_PATTERN = re.compile(r"^[0-9]{2}[A-Z][A-Z0-9]{0,1}[0-9]{4,5}$")

VALID_SERIES_LETTERS = set("ABCDEFGHKLMNPSTUVXYZ")


def normalize_text(text: str) -> str:
    """Uppercase and strip every non-alphanumeric character."""
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def canonicalize_plate(text: str) -> str:
    """Fix common OCR confusions using Vietnamese plate structure.

    The first two characters are the province code (digits), the following
    one or two characters identify the series, and the final four or five
    characters are digits.
    """
    normalized = normalize_text(text)
    if len(normalized) < 7 or len(normalized) > 9:
        return normalized

    chars = list(normalized)

    for index in (0, 1):
        chars[index] = LETTER_TO_DIGIT.get(chars[index], chars[index])

    tail_length = 5 if len(normalized) >= 8 else 4
    tail_start = len(normalized) - tail_length
    for index in range(tail_start, len(normalized)):
        chars[index] = LETTER_TO_DIGIT.get(chars[index], chars[index])

    if 2 < tail_start:
        chars[2] = DIGIT_TO_LETTER.get(chars[2], chars[2])

    return "".join(chars)


def is_valid_plate(text: str) -> bool:
    """Return True if the text looks like a Vietnamese license plate."""
    candidate = canonicalize_plate(text)
    if not 7 <= len(candidate) <= 9:
        return False
    if not PLATE_PATTERN.fullmatch(candidate):
        return False
    series = plate_series(candidate)
    if not series:
        return False
    return all(
        character in VALID_SERIES_LETTERS
        for character in series
        if character.isalpha()
    )


def format_plate(text: str) -> str:
    """Return the human-readable display form, e.g. 51F-882.34."""
    candidate = canonicalize_plate(text)
    if len(candidate) < 7:
        return candidate

    tail_length = 5 if len(candidate) >= 8 else 4
    tail_start = len(candidate) - tail_length
    prefix = candidate[:tail_start]
    digits = candidate[tail_start:]

    if tail_length == 5:
        formatted_digits = f"{digits[:3]}.{digits[3:]}"
    else:
        formatted_digits = f"{digits[:2]}.{digits[2:]}"

    return f"{prefix}-{formatted_digits}"


def province_name(text: str) -> str:
    """Resolve the province name from the two-digit plate prefix."""
    candidate = canonicalize_plate(text)
    if len(candidate) < 2:
        return "Không xác định"
    return PROVINCE_CODES.get(candidate[:2], "Không xác định")


def plate_series(text: str) -> str:
    """Return the series portion of a plate (province and tail excluded)."""
    candidate = canonicalize_plate(text)
    if len(candidate) < 7:
        return ""
    tail_length = 5 if len(candidate) >= 8 else 4
    return candidate[2: len(candidate) - tail_length]
