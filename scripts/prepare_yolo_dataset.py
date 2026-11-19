"""Dataset preparation script: Convert Pascal VOC XML annotations to YOLO format.

Converts:
  Input : data/datasets/car_plate_detection/ (images + annotations XML)
  Output: data/datasets/yolo_plate_dataset/
            ├── images/
            │     ├── train/
            │     └── val/
            ├── labels/
            │     ├── train/
            │     └── val/
            └── dataset.yaml

Classes:
  0: plate_1_line (Aspect Ratio W/H >= 2.3 - chữ nhật dài)
  1: plate_2_line (Aspect Ratio W/H < 2.3 - biển vuông / gần vuông)
"""

import argparse
from pathlib import Path
import random
import shutil
import sys
import xml.etree.ElementTree as ET
from typing import Dict, List, Tuple

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

SOURCE_IMG_DIR = PROJECT_ROOT / "data" / "datasets" / "car_plate_detection" / "images"
SOURCE_ANN_DIR = PROJECT_ROOT / "data" / "datasets" / "car_plate_detection" / "annotations"
OUTPUT_DIR = PROJECT_ROOT / "data" / "datasets" / "yolo_plate_dataset"


def parse_voc_xml(xml_path: Path) -> Tuple[int, int, List[Tuple[int, float, float, float, float]]]:
    """Parse Pascal VOC XML file and return image width, height, and list of YOLO boxes.

    Returns:
        (img_width, img_height, [(class_id, x_center, y_center, width, height), ...])
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    size_elem = root.find("size")
    if size_elem is None:
        raise ValueError(f"Missing <size> tag in {xml_path}")

    img_w = float(size_elem.find("width").text)
    img_h = float(size_elem.find("height").text)

    if img_w <= 0 or img_h <= 0:
        raise ValueError(f"Invalid image dimensions in {xml_path}: {img_w}x{img_h}")

    boxes = []
    for obj in root.findall("object"):
        bnd = obj.find("bndbox")
        if bnd is None:
            continue

        xmin = float(bnd.find("xmin").text)
        ymin = float(bnd.find("ymin").text)
        xmax = float(bnd.find("xmax").text)
        ymax = float(bnd.find("ymax").text)

        # Clamp coordinates to image boundaries
        xmin = max(0.0, min(xmin, img_w))
        ymin = max(0.0, min(ymin, img_h))
        xmax = max(0.0, min(xmax, img_w))
        ymax = max(0.0, min(ymax, img_h))

        box_w = xmax - xmin
        box_h = ymax - ymin

        if box_w <= 0 or box_h <= 0:
            continue

        # Classify based on Aspect Ratio (Width / Height)
        # Vietnamese and international plate standard:
        # Long 1-line plate: AR ~ 2.5 to 4.5 -> class 0
        # Square 2-line plate: AR ~ 1.2 to 2.2 -> class 1
        aspect_ratio = box_w / box_h
        class_id = 0 if aspect_ratio >= 2.3 else 1

        # Normalized YOLO format coordinates [0.0, 1.0]
        x_center = (xmin + xmax) / 2.0 / img_w
        y_center = (ymin + ymax) / 2.0 / img_h
        norm_w = box_w / img_w
        norm_h = box_h / img_h

        # Strict bounds verification
        x_center = max(0.0, min(1.0, x_center))
        y_center = max(0.0, min(1.0, y_center))
        norm_w = max(0.0, min(1.0, norm_w))
        norm_h = max(0.0, min(1.0, norm_h))

        boxes.append((class_id, x_center, y_center, norm_w, norm_h))

    return int(img_w), int(img_h), boxes


def prepare_dataset(val_ratio: float = 0.2, seed: int = 42) -> Dict[str, int]:
    """Convert Pascal VOC dataset to YOLO structure with Train/Val split."""
    random.seed(seed)

    print("=" * 65)
    print(" 🛠 CHUYỂN ĐỔI DATASET PASCAL VOC -> YOLO FORMAT")
    print("=" * 65)
    print(f" • Thư mục nguồn ảnh   : {SOURCE_IMG_DIR}")
    print(f" • Thư mục nguồn nhãn  : {SOURCE_ANN_DIR}")
    print(f" • Thư mục đích        : {OUTPUT_DIR}")
    print(f" • Tỷ lệ Validation    : {val_ratio * 100:.0f}% (Train {(1 - val_ratio) * 100:.0f}%)")
    print("-" * 65)

    if not SOURCE_IMG_DIR.is_dir() or not SOURCE_ANN_DIR.is_dir():
        raise FileNotFoundError(
            f"Không tìm thấy dữ liệu nguồn tại {SOURCE_IMG_DIR} hoặc {SOURCE_ANN_DIR}!"
        )

    # Find matching image and xml pairs
    xml_files = sorted(list(SOURCE_ANN_DIR.glob("*.xml")))
    valid_samples = []

    for xml_path in xml_files:
        stem = xml_path.stem
        # Try finding corresponding image (.png, .jpg, .jpeg)
        img_path = None
        for ext in [".png", ".jpg", ".jpeg", ".PNG", ".JPG"]:
            cand = SOURCE_IMG_DIR / f"{stem}{ext}"
            if cand.is_file():
                img_path = cand
                break

        if img_path:
            valid_samples.append((img_path, xml_path))

    total_samples = len(valid_samples)
    print(f"[*] Tìm thấy {total_samples} cặp ảnh và nhãn XML hợp lệ.")

    # Shuffle with fixed seed for reproducibility
    random.shuffle(valid_samples)

    split_idx = int(total_samples * (1.0 - val_ratio))
    train_samples = valid_samples[:split_idx]
    val_samples = valid_samples[split_idx:]

    print(f"[*] Phân chia tập dữ liệu: {len(train_samples)} Train | {len(val_samples)} Validation")

    # Create destination directories
    for split in ["train", "val"]:
        (OUTPUT_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (OUTPUT_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)

    stats = {
        "train_images": 0,
        "val_images": 0,
        "class_0_plate_1_line": 0,
        "class_1_plate_2_line": 0,
    }

    # Process Train set
    for img_path, xml_path in train_samples:
        _, _, boxes = parse_voc_xml(xml_path)
        if not boxes:
            continue

        # Copy image
        dest_img = OUTPUT_DIR / "images" / "train" / img_path.name
        shutil.copy2(img_path, dest_img)

        # Write YOLO label
        label_path = OUTPUT_DIR / "labels" / "train" / f"{img_path.stem}.txt"
        with open(label_path, "w", encoding="utf-8") as f:
            for cls_id, xc, yc, w, h in boxes:
                f.write(f"{cls_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                if cls_id == 0:
                    stats["class_0_plate_1_line"] += 1
                else:
                    stats["class_1_plate_2_line"] += 1

        stats["train_images"] += 1

    # Process Validation set
    for img_path, xml_path in val_samples:
        _, _, boxes = parse_voc_xml(xml_path)
        if not boxes:
            continue

        # Copy image
        dest_img = OUTPUT_DIR / "images" / "val" / img_path.name
        shutil.copy2(img_path, dest_img)

        # Write YOLO label
        label_path = OUTPUT_DIR / "labels" / "val" / f"{img_path.stem}.txt"
        with open(label_path, "w", encoding="utf-8") as f:
            for cls_id, xc, yc, w, h in boxes:
                f.write(f"{cls_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
                if cls_id == 0:
                    stats["class_0_plate_1_line"] += 1
                else:
                    stats["class_1_plate_2_line"] += 1

        stats["val_images"] += 1

    # Create dataset.yaml for Ultralytics YOLO
    yaml_content = f"""# Ultralytics YOLO Dataset Configuration for License Plate Detection
path: {OUTPUT_DIR.resolve().as_posix()}
train: images/train
val: images/val

names:
  0: plate_1_line
  1: plate_2_line
"""
    yaml_path = OUTPUT_DIR / "dataset.yaml"
    yaml_path.write_text(yaml_content, encoding="utf-8")

    print("-" * 65)
    print(" ✅ CHUYỂN ĐỔI HOÀN TẤT!")
    print(f" • Ảnh tập Train       : {stats['train_images']} ảnh")
    print(f" • Ảnh tập Validation  : {stats['val_images']} ảnh")
    print(f" • Biển 1 dòng chữ nhật: {stats['class_0_plate_1_line']} boxes")
    print(f" • Biển 2 dòng vuông   : {stats['class_1_plate_2_line']} boxes")
    print(f" • Cấu hình YOLO YAML  : {yaml_path}")
    print("=" * 65 + "\n")

    return stats


def verify_dataset() -> bool:
    """Verify integrity of the generated YOLO dataset."""
    yaml_path = OUTPUT_DIR / "dataset.yaml"
    if not yaml_path.is_file():
        print(f"[ERROR] Không tìm thấy {yaml_path}!")
        return False

    all_valid = True
    for split in ["train", "val"]:
        img_dir = OUTPUT_DIR / "images" / split
        lbl_dir = OUTPUT_DIR / "labels" / split

        imgs = list(img_dir.glob("*.*"))
        lbls = list(lbl_dir.glob("*.txt"))

        print(f"[*] Kiểm tra tập '{split}': {len(imgs)} ảnh, {len(lbls)} nhãn.")
        if len(imgs) != len(lbls):
            print(f"[WARN] Số ảnh ({len(imgs)}) và số nhãn ({len(lbls)}) không khớp!")
            all_valid = False

        # Check label content format
        for lbl_file in lbls:
            lines = lbl_file.read_text(encoding="utf-8").strip().splitlines()
            if not lines:
                print(f"[WARN] Tệp nhãn rỗng: {lbl_file.name}")
            for line in lines:
                parts = line.strip().split()
                if len(parts) != 5:
                    print(f"[ERROR] Dòng nhãn không hợp lệ trong {lbl_file.name}: {line}")
                    all_valid = False
                cls_id = int(parts[0])
                coords = [float(p) for p in parts[1:]]
                if cls_id not in (0, 1):
                    print(f"[ERROR] Class ID lạ {cls_id} trong {lbl_file.name}")
                    all_valid = False
                for c in coords:
                    if not (0.0 <= c <= 1.0):
                        print(f"[ERROR] Tọa độ vượt giới hạn [0, 1]: {c} trong {lbl_file.name}")
                        all_valid = False

    if all_valid:
        print("✅ Toàn bộ tập dữ liệu YOLO đã được xác minh: 100% hợp lệ!")
    return all_valid


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Chuyển đổi dataset sang YOLO format")
    parser.add_argument("--val-ratio", type=float, default=0.2, help="Tỷ lệ tập validation (mặc định: 0.2)")
    parser.add_argument("--verify", action="store_true", help="Chỉ kiểm tra tính toàn vẹn của dataset")
    args = parser.parse_args()

    if args.verify:
        verify_dataset()
    else:
        prepare_dataset(val_ratio=args.val_ratio)
        verify_dataset()
