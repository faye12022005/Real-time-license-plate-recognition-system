# Real-time License Plate Recognition System

Pipeline Python nhận diện biển số xe từ video offline hoặc camera/RTSP thời gian thực, sử dụng 3 model YOLO11n đã huấn luyện:

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

### Chạy camera thời gian thực

```powershell
# Webcam mặc định (index 0)
python main.py --camera 0

# Tự nhận diện nếu source là index hoặc URL stream
python main.py 0
python main.py "rtsp://user:pass@192.168.1.10:554/stream1"

# IP camera, giới hạn 60 giây, có ghi video annotated
python main.py --camera "rtsp://user:pass@192.168.1.10:554/stream1" --duration 60 --save-video

# Chạy không mở cửa sổ preview (phù hợp server/headless)
python main.py --camera 0 --no-display --max-frames 500

# Tự kết nối lại vô hạn khi stream gián đoạn (Ctrl+C để dừng)
python main.py --camera "rtsp://192.168.1.10:554/stream1" --reconnect-attempts -1
```

Ở chế độ camera, biển số được xác nhận và ghi vào MySQL ngay khi đủ số phiếu
(`--min-votes`), không cần chờ kết thúc phiên. Khi dừng, `results.json`/`results.csv`
và crop của phiên được lưu trong `output/camera_<timestamp>/`. Mặc định camera không
ghi video annotated; dùng `--save-video` nếu cần.

### Giao diện web trực quan (Next.js + FastAPI)

Backend FastAPI cung cấp REST API và luồng MJPEG để xem camera nhận diện trực
tiếp trên trình duyệt:

```powershell
# Terminal 1: API backend (http://localhost:8000)
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000

# Terminal 2: giao diện Next.js (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Mở `http://localhost:3000/camera`, nhập nguồn camera (`0` cho webcam hoặc URL
RTSP/HTTP), chọn số phiếu tối thiểu rồi bấm **Bắt đầu**. Trang camera hiển thị
luồng MJPEG có bounding box, FPS, số frame và danh sách biển số vừa xác nhận.

- Swagger/OpenAPI: `http://localhost:8000/docs`
- Snapshot JPEG: `http://localhost:8000/api/cameras/snapshot`
- MJPEG stream: `http://localhost:8000/api/cameras/stream`
- Mặc định không ghi MySQL/không lưu video trong web; bật checkbox tương ứng nếu cần.
- Có thể đổi origin API bằng `NEXT_PUBLIC_API_ORIGIN` (mặc định
  `http://localhost:8000`) trong `frontend/.env.local`.

Trang `http://localhost:3000/upload` tải video lên backend thật:

- `POST /api/v1/videos/upload` lưu tệp vào `data/uploads/` và đưa vào hàng đợi xử lý.
- Worker nền chạy `ALPRPipeline.process_video` tuần tự, cập nhật tiến độ qua
  `GET /api/v1/videos/jobs` và `GET /api/v1/videos/jobs/{job_id}`.
- Kết quả biển số: `GET /api/v1/videos/jobs/{job_id}/records`.
- Video gốc được phục vụ tại `GET /api/v1/videos/{job_id}/file` để trình phát
  hiển thị đúng video vừa tải lên.
- Tệp tải lên tối đa 1 GB; định dạng hỗ trợ: MP4, AVI, MOV, MKV, WEBM, M4V,
  MPG, MPEG.

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

Kết quả được lưu vào MySQL (bảng `jobs` và `plate_records`) trừ khi dùng `--no-db`.
Có thể truy vấn lại bằng `PlateRepository.trace()` hoặc `kpis()`.

## Kết nối database (MySQL)

Yêu cầu MySQL 8.0+ hoặc MariaDB tương thích. Driver `PyMySQL` đã nằm trong
`requirements.txt`.

Cấu hình bằng biến môi trường (giá trị trong ngoặc là mặc định):

| Biến | Ý nghĩa |
|---|---|
| `ALPR_MYSQL_HOST` | Host MySQL (`127.0.0.1`) |
| `ALPR_MYSQL_PORT` | Cổng MySQL (`3306`) |
| `ALPR_MYSQL_USER` | Tài khoản (`root`) |
| `ALPR_MYSQL_PASSWORD` | Mật khẩu (rỗng) |
| `ALPR_MYSQL_DATABASE` | Tên database (`alpr`) |

Ví dụ trên PowerShell:

```powershell
$env:ALPR_MYSQL_HOST = "127.0.0.1"
$env:ALPR_MYSQL_PORT = "3306"
$env:ALPR_MYSQL_USER = "alpr"
$env:ALPR_MYSQL_PASSWORD = "mat-khau"
$env:ALPR_MYSQL_DATABASE = "alpr"
```

Database và hai bảng chính được tạo tự động nếu tài khoản có quyền `CREATE`:

```powershell
# Khởi tạo database/bảng
python -c "from src.database.connection import init_db; init_db(); print('Database ready')"

# Kiểm tra schema và dữ liệu hiện có
python -c "from src.database.repository import PlateRepository; print(PlateRepository().kpis())"
```

Trong mã Python, tạo repository bằng `PlateRepository()` để tự động tạo database và
các bảng nếu chưa tồn tại:

```python
from src.database.repository import PlateRepository

repository = PlateRepository()
records = repository.list_records(limit=50)
```

Có thể trỏ sang database khác bằng cách truyền tên database:

```python
repository = PlateRepository("alpr_test")
```

### Chuyển dữ liệu từ SQLite cũ

Nếu còn file `data/alpr.db` từ phiên bản SQLite, chạy script migration (idempotent,
dùng upsert nên có thể chạy lại):

```powershell
python scripts/migrate_sqlite_to_mysql.py

# Hoặc chỉ định nguồn/đích
python scripts/migrate_sqlite_to_mysql.py --sqlite data\alpr.db --database alpr
```

## Cấu trúc

- `config/settings.py` — đường dẫn model, ngưỡng confidence, tham số tracker.
- `src/core/detector.py` — wrapper YOLO cho vehicle/plate và logic chọn xe theo biển.
- `src/core/ocr.py` — EasyOCR + character detector, fusion và sửa lỗi OCR.
- `src/core/tracker.py` — IoU tracker gộp detection qua các frame.
- `src/pipeline/stream_reader.py` — đọc video/camera bằng thread riêng, tự reconnect.
- `src/pipeline/alpr_pipeline.py` — orchestration, voting, realtime emit, xuất kết quả.
- `src/utils/plate_validator.py` — chuẩn hoá, sửa lỗi, format biển số VN và mã tỉnh.
- `src/utils/source.py` — nhận diện/parse nguồn camera và che credentials trong log/DB.
- `src/database/` — MySQL connection + repository.
- `api/` — FastAPI server, camera session manager, video upload job manager và
  REST/MJPEG/upload endpoints.
- `frontend/` — Next.js dashboard, trang `/camera` để test camera trực quan và
  trang `/upload` để tải/phân tích video thật.
- `scripts/migrate_sqlite_to_mysql.py` — chuyển dữ liệu từ SQLite cũ sang MySQL.
- `tests/` — unit test cho validator, OCR fusion, detector helper, tracker, API; test DB
  tự skip nếu không kết nối được MySQL.

## Kiểm thử

```powershell
python -m pytest -q
```

Test database dùng database riêng `ALPR_TEST_MYSQL_DATABASE` (mặc định `alpr_test`) và
tự động skip nếu không kết nối được MySQL.
