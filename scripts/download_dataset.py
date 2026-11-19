"""Dataset download and setup script for Vietnamese ALPR system.

Supports loading credentials directly from `.env.local` / `.env`,
authenticating via `KAGGLE_API_TOKEN` (KGAT_...) or `KAGGLE_USERNAME` + `KAGGLE_KEY`,
and downloading curated datasets into `data/datasets/`.
"""

import argparse
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Dict, Optional

# Ensure UTF-8 output for Windows terminal
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config.settings import DATASETS_DIR

# Registry of curated datasets on Kaggle
DATASET_REGISTRY = {
    "vietnam-lpd": {
        "slug": "muthukrishnan/vietnam-license-plate-segment-datasets",
        "description": "Biển số xe Việt Nam: Phân loại 1 dòng (LpD) và 2 dòng (LpV)",
        "target_dir": "vietnam_license_plate",
        "type": "detection",
    },
    "car-plate-detection": {
        "slug": "andrewmvd/car-plate-detection",
        "description": "Benchmark phát hiện biển số xe (433 ảnh, Pascal VOC)",
        "target_dir": "car_plate_detection",
        "type": "detection",
    },
    "lp-characters-ocr": {
        "slug": "itsahmedmurad/license-plate-characters-detection-ocr",
        "description": "Nhận diện từng ký tự biển số (0-9, A-Z) với bounding box",
        "target_dir": "lp_characters_ocr",
        "type": "ocr",
    },
}


def load_env_credentials() -> Dict[str, str]:
    """Load credentials from .env.local and .env files."""
    loaded = {}
    candidates = [
        PROJECT_ROOT / ".env.local",
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / "frontend" / ".env.local",
    ]

    for env_path in candidates:
        if not env_path.is_file():
            continue

        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    # Handle 'export KEY=VAL'
                    if line.startswith("export "):
                        line = line[len("export ") :].strip()

                    if "=" not in line:
                        continue

                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")

                    if key and val:
                        os.environ[key] = val
                        loaded[key] = val
        except Exception as e:
            print(f"[WARN] Không thể đọc {env_path}: {e}")

    # Synchronize credentials to ~/.kaggle for Kaggle CLI & SDK compatibility
    kaggle_dir = Path.home() / ".kaggle"
    try:
        kaggle_dir.mkdir(parents=True, exist_ok=True)

        token = os.getenv("KAGGLE_API_TOKEN")
        if token:
            access_token_file = kaggle_dir / "access_token"
            access_token_file.write_text(token.strip(), encoding="utf-8")

        username = os.getenv("KAGGLE_USERNAME")
        key = os.getenv("KAGGLE_KEY")
        if username and key:
            kaggle_json = kaggle_dir / "kaggle.json"
            kaggle_json.write_text(
                json.dumps({"username": username, "key": key}, indent=2),
                encoding="utf-8",
            )
    except Exception as e:
        print(f"[WARN] Không thể ghi file cấu hình vào ~/.kaggle: {e}")

    return loaded


def check_kaggle_auth() -> bool:
    """Check if valid Kaggle credentials exist in environment or config files."""
    load_env_credentials()

    # 1. Check KAGGLE_API_TOKEN (e.g. KGAT_...)
    if os.getenv("KAGGLE_API_TOKEN"):
        return True

    # 2. Check KAGGLE_USERNAME and KAGGLE_KEY
    if os.getenv("KAGGLE_USERNAME") and os.getenv("KAGGLE_KEY"):
        return True

    # 3. Check ~/.kaggle/access_token
    kaggle_dir = Path.home() / ".kaggle"
    if (kaggle_dir / "access_token").is_file():
        return True

    # 4. Check ~/.kaggle/kaggle.json
    if (kaggle_dir / "kaggle.json").is_file():
        return True

    return False


def print_kaggle_setup_guide() -> None:
    """Print instructions for configuring credentials in .env.local."""
    env_local_path = PROJECT_ROOT / ".env.local"
    print("\n" + "=" * 65)
    print(" HƯỚNG DẪN CẤU HÌNH KAGGLE TOKEN TRONG .env.local")
    print("=" * 65)
    print(f"File cấu hình: {env_local_path}")
    print("\nCách 1: Sử dụng Kaggle API Token mới (Khuyên dùng):")
    print("1. Vào: https://www.kaggle.com/settings -> mục 'API'")
    print("2. Nhấn 'Create New Token' / 'Generate New Token'")
    print("3. Thêm dòng sau vào file .env.local:")
    print("   KAGGLE_API_TOKEN=KGAT_your_api_token_here")
    print("\nCách 2: Sử dụng Username + API Key truyền thống:")
    print("   KAGGLE_USERNAME=your_username")
    print("   KAGGLE_KEY=your_api_key")
    print("=" * 65 + "\n")


def list_datasets() -> None:
    """List all available datasets in registry."""
    print("\nDANH SÁCH DATASET KHUYÊN DÙNG CHO DỰ ÁN:")
    print("-" * 70)
    for key, info in DATASET_REGISTRY.items():
        print(f"  • Mã lệnh : {key}")
        print(f"    Kaggle  : {info['slug']}")
        print(f"    Mô tả   : {info['description']}")
        print(f"    Mục đích: {info['type']}")
        print(f"    Lưu tại : data/datasets/{info['target_dir']}/\n")
    print("-" * 70)


def copy_or_extract(src_path: Path, dest_dir: Path) -> None:
    """Copy or extract downloaded dataset files into target destination."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    if src_path.is_dir():
        for item in src_path.iterdir():
            target = dest_dir / item.name
            if item.is_dir():
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(item, target)
            else:
                shutil.copy2(item, target)
    elif src_path.is_file() and src_path.suffix.lower() == ".zip":
        with zipfile.ZipFile(src_path, "r") as z:
            z.extractall(dest_dir)


def download_dataset(dataset_key: str, dest_root: Path) -> bool:
    """Download and extract a dataset from Kaggle."""
    if dataset_key not in DATASET_REGISTRY:
        print(f"[ERROR] Không tìm thấy dataset với mã '{dataset_key}'. Dùng --list để xem danh sách.")
        return False

    # Load credentials from .env.local
    creds = load_env_credentials()
    if not check_kaggle_auth():
        print("[WARNING] Chưa tìm thấy Kaggle credentials trong .env.local hoặc ~/.kaggle/!")
        print_kaggle_setup_guide()
        return False

    info = DATASET_REGISTRY[dataset_key]
    slug = info["slug"]
    target_path = dest_root / info["target_dir"]
    target_path.mkdir(parents=True, exist_ok=True)

    print(f"[*] Bắt đầu tải dataset: {slug}")
    print(f"[*] Đích đến: {target_path}")

    # Method 1: Try kagglehub (Recommended modern library)
    try:
        import importlib

        kagglehub = importlib.import_module("kagglehub")  # type: ignore

        print("[*] Đang tải qua kagglehub SDK...")
        downloaded_path = kagglehub.dataset_download(slug)
        if downloaded_path and Path(downloaded_path).exists():
            print(f"[*] Đã tải về cache: {downloaded_path}")
            print(f"[*] Đang đồng bộ vào {target_path}...")
            copy_or_extract(Path(downloaded_path), target_path)
            print(f"[SUCCESS] Dataset đã sẵn sàng tại: {target_path}")
            return True
    except (ImportError, ModuleNotFoundError):
        pass
    except Exception as e:
        print(f"[INFO] kagglehub trả về: {e}. Thử phương pháp tiếp theo...")

    # Method 2: Try legacy Kaggle API package
    try:
        import importlib

        kaggle_mod = importlib.import_module("kaggle.api.kaggle_api_extended")  # type: ignore
        KaggleApi = getattr(kaggle_mod, "KaggleApi")

        api = KaggleApi()
        api.authenticate()
        print("[*] Đang tải qua KaggleApi CLI...")
        api.dataset_download_files(slug, path=str(target_path), unzip=True)
        print(f"[SUCCESS] Dataset đã sẵn sàng tại: {target_path}")
        return True
    except (ImportError, ModuleNotFoundError):
        pass
    except Exception as e:
        print(f"[INFO] KaggleApi trả về: {e}")

    # Method 3: Direct API download via requests / urllib
    token = os.getenv("KAGGLE_API_TOKEN")
    if token:
        try:
            import urllib.request

            print("[*] Thử tải trực tiếp qua Kaggle REST API...")
            url = f"https://www.kaggle.com/api/v1/datasets/download/{slug}"
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "User-Agent": "ALPR-Dataset-Downloader/1.0",
                },
            )
            zip_dest = target_path / "dataset.zip"
            with urllib.request.urlopen(req) as resp, open(zip_dest, "wb") as out_file:
                shutil.copyfileobj(resp, out_file)

            if zip_dest.exists() and zip_dest.stat().st_size > 1000:
                with zipfile.ZipFile(zip_dest, "r") as z:
                    z.extractall(target_path)
                zip_dest.unlink(missing_ok=True)
                print(f"[SUCCESS] Tải và giải nén thành công vào: {target_path}")
                return True
        except Exception as e:
            print(f"[INFO] Direct REST download: {e}")

    print(f"[ERROR] Không thể tự động tải dataset '{slug}'.")
    print(f"[*] Bạn có thể tải thủ công qua trình duyệt tại:")
    print(f"    https://www.kaggle.com/datasets/{slug}")
    print(f"    Sau đó giải nén vào thư mục: {target_path}")
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Tải dataset cho dự án ALPR từ Kaggle")
    parser.add_argument(
        "--dataset",
        type=str,
        default=None,
        help="Mã dataset dựng sẵn (car-plate-detection, vietnam-lpd, lp-characters-ocr, all)",
    )
    parser.add_argument(
        "--slug",
        type=str,
        default=None,
        help="Đường dẫn dataset bất kỳ trên Kaggle (Ví dụ: andrewmvd/car-plate-detection)",
    )
    parser.add_argument("--list", action="store_true", help="Liệt kê các dataset có sẵn")
    parser.add_argument("--guide", action="store_true", help="Hiển thị hướng dẫn cấu hình Kaggle API")

    args = parser.parse_args()

    if args.list:
        list_datasets()
        return

    if args.guide:
        print_kaggle_setup_guide()
        return

    dest_dir = DATASETS_DIR

    # Custom slug provided
    if args.slug:
        slug = args.slug.strip()
        folder_name = slug.split("/")[-1]
        DATASET_REGISTRY[folder_name] = {
            "slug": slug,
            "description": f"Custom Kaggle Dataset: {slug}",
            "target_dir": folder_name,
            "type": "custom",
        }
        download_dataset(folder_name, dest_dir)
        return

    # Preset dataset
    selected = args.dataset or "car-plate-detection"
    if selected.lower() == "all":
        for k in DATASET_REGISTRY:
            download_dataset(k, dest_dir)
    else:
        download_dataset(selected, dest_dir)


if __name__ == "__main__":
    main()
