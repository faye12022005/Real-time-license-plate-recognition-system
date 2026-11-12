# Real-time License Plate Recognition System

Pipeline Python nhận diện biển số xe từ video offline, sử dụng 3 model YOLO11n đã huấn luyện:

| Model | File | Vai trò |
|---|---|---|
| Vehicle detector | `data/models/vehicle_detector.pt` | Phát hiện phương tiện (7 class: bicycle, bus, car, motorbike, rickshaw, truck, van) |
| Plate detector | `data/models/plate_detector.pt` | Phát hiện vùng biển số (`license_plate`) |
| Character detector | `data/models/plate_char_detector.pt` | Nhận diện từng ký tự biển số (36 class: `0-9`, `A-Z`) |

> **Ghi chú:** model ký tự thực tế có đủ 36 class (`0-9`, `A-Z`). Pipeline mặc định dùng
> **hybrid**: EasyOCR đọc toàn bộ biển, model ký tự xác nhận/sửa từng ký tự (ví dụ
> EasyOCR đọc thiếu chữ `F` trong `5188234` → `51F88234`). Có thể chạy hoàn toàn bằng
> model ký tự với `--ocr char` nếu không muốn cài EasyOCR.

## Cài đặt

```powershell
cd D:\Python\Real-time-license-plate-recognition-system
python -m pip install -r requirements.txt
```

Nếu dùng GPU, cài `torch`/`torchvision` bản CUDA phù hợp trước, sau đó thêm `--gpu`
(EasyOCR) và/hoặc `--device 0` (Ultralytics).

## Chạy

```powershell
# Xử lý một video
python main.py "D:\Python\Training\testvideo\test_4.mp4"

# Chỉ định thư mục output
python main.py video.mp4 --output output\demo

# Xử lý toàn bộ video trong thư mục
python main.py "D:\Python\Training\testvideo"

# Dùng GPU cho EasyOCR và YOLO
python main.py video.mp4 --gpu --device 0

# Tăng tốc bằng cách bỏ qua frame (inference mỗi 2 frame)
python main.py video.mp4 --stride 2

# Không ghi video annotated / không lưu DB
python main.py video.mp4 --no-annotated --no-db

# Chỉ dùng model ký tự (không cần EasyOCR)
python main.py video.mp4 --ocr char

# Xuất JSON summary ra stdout
python main.py video.mp4 --json
```

Xem tất cả tuỳ chọn:

```powershell
python main.py --help
```

## Kết quả

Mỗi video tạo một thư mục trong `output/<ten_video>/`:

```
output/<ten_video>/
├── <ten_video>_annotated.mp4   # Video có vẽ box + biển số
├── results.json                # Job + danh sách PlateRecord
├── results.csv                 # Bảng kết quả
└── crops/                      # Ảnh crop biển số tốt nhất cho mỗi track
```

Kết quả được lưu vào SQLite tại `data/alpr.db` (bảng `jobs` và `plate_records`) trừ khi
dùng `--no-db`. Có thể truy vấn lại bằng `PlateRepository.trace()` hoặc `kpis()`.

## Cấu trúc

- `config/settings.py` — đường dẫn model, ngưỡng confidence, tham số tracker.
- `src/core/detector.py` — wrapper YOLO cho vehicle/plate và logic chọn xe theo biển.
- `src/core/ocr.py` — EasyOCR + character detector, fusion và sửa lỗi OCR.
- `src/core/tracker.py` — IoU tracker gộp detection qua các frame.
- `src/pipeline/stream_reader.py` — đọc video bằng thread riêng.
- `src/pipeline/alpr_pipeline.py` — orchestration, voting, xuất kết quả.
- `src/utils/plate_validator.py` — chuẩn hoá, sửa lỗi, format biển số VN và mã tỉnh.
- `src/database/` — SQLite connection + repository.
- `tests/` — unit test cho validator, OCR fusion, detector helper, tracker.

## Kiểm thử

```powershell
python -m pytest -q
```
