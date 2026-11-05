import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import xml.etree.ElementTree as ET
from pathlib import Path
from collections import Counter
import cv2

ann_dir = Path("data/datasets/car_plate_detection/annotations")
img_dir = Path("data/datasets/car_plate_detection/images")

classes = Counter()
sizes = []
aspect_ratios = []
boxes_per_img = []
line_types = Counter() # 1-line vs 2-line plates based on aspect ratio: > 2.5 is typically 1-line, <= 2.5 is 2-line

for xml_file in ann_dir.glob("*.xml"):
    tree = ET.parse(xml_file)
    root = tree.getroot()
    objs = root.findall("object")
    boxes_per_img.append(len(objs))
    
    size_elem = root.find("size")
    img_w = float(size_elem.find("width").text)
    img_h = float(size_elem.find("height").text)
    sizes.append((img_w, img_h))

    for obj in objs:
        name = obj.find("name").text
        classes[name] += 1
        bnd = obj.find("bndbox")
        xmin = float(bnd.find("xmin").text)
        ymin = float(bnd.find("ymin").text)
        xmax = float(bnd.find("xmax").text)
        ymax = float(bnd.find("ymax").text)
        w = xmax - xmin
        h = ymax - ymin
        if h > 0:
            ar = w / h
            aspect_ratios.append(ar)
            if ar >= 2.3:
                line_types["plate_1_line (chữ nhật dài)"] += 1
            else:
                line_types["plate_2_line (vuông/gần vuông)"] += 1

print("=" * 60)
print("PHÂN TÍCH DATASET CAR_PLATE_DETECTION (Kaggle)")
print("=" * 60)
print(f"Tổng số ảnh        : {len(list(img_dir.glob('*.png')))}")
print(f"Tổng số file XML   : {len(list(ann_dir.glob('*.xml')))}")
print(f"Nhãn trong XML     : {dict(classes)}")
print(f"Số box/ảnh         : {dict(Counter(boxes_per_img))}")
print(f"Phân loại tỷ lệ W/H: {dict(line_types)}")
print(f"Aspect ratio TB    : {round(sum(aspect_ratios)/len(aspect_ratios), 2):.2f}")
print("=" * 60)
