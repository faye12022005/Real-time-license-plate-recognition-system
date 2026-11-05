import os
from pathlib import Path
import shutil

token = "KGAT_5e1b36b56073527f5469637b535aef27"
os.environ["KAGGLE_API_TOKEN"] = token

import kagglehub

TARGET_DIR = Path("data/sample_videos")
TARGET_DIR.mkdir(parents=True, exist_ok=True)

print("[INFO] Downloading farzadnekouei/license-plate-recognition-for-red-light-violation via kagglehub...")
path = kagglehub.dataset_download("farzadnekouei/license-plate-recognition-for-red-light-violation")
print(f"[SUCCESS] Downloaded to: {path}")

for root, dirs, files in os.walk(path):
    print(f"Dir: {root}")
    for f in files:
        src = Path(root) / f
        size_mb = src.stat().st_size / (1024 * 1024)
        print(f"  - {f} ({size_mb:.2f} MB)")
        if f.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
            dest = TARGET_DIR / f
            print(f"    -> Copying to {dest}...")
            shutil.copy2(src, dest)
            print(f"    -> Copied successfully!")

print("[DONE] Finished downloading and copying videos to data/sample_videos/")
