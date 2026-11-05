# 🚗 SMART ALPR 2.0 - HỆ THỐNG NHẬN DIỆN BIỂN SỐ XE THỜI GIAN THỰC & QUẢN LÝ BÃI XE THÔNG MINH

Hệ thống nhận diện biển số xe (Automatic License Plate Recognition - ALPR) ứng dụng Trí tuệ nhân tạo (YOLOv8 + EasyOCR), kết hợp quản lý vận hành bãi đỗ xe thông minh theo thời gian thực cho tòa nhà/chung cư. Dự án được xây dựng với kiến trúc hướng dịch vụ gồm **FastAPI** backend, giao diện quản trị **Next.js 14 (App Router)** và hỗ trợ đa cơ sở dữ liệu (**SQLite**, **MySQL**, **SQL Server**).

---

## 📌 Mục lục

1. [Tổng quan & Tính năng chính](#1-tổng-quan--tính-năng-chính)
2. [Yêu cầu hệ thống](#2-yêu-cầu-hệ-thống)
3. [Hướng dẫn cài đặt và chạy dự án (Từng bước)](#3-hướng-dẫn-cài-đặt-và-chạy-dự-án-từng-bước)
   - [Bước 1: Chuẩn bị mã nguồn](#bước-1-chuẩn-bị-mã-nguồn)
   - [Bước 2: Cài đặt và cấu hình Backend](#bước-2-cài-đặt-và-cấu-hình-backend)
   - [Bước 3: Lựa chọn và cấu hình Cơ sở dữ liệu](#bước-3-lựa-chọn-và-cấu-hình-cơ-sở-dữ-liệu)
   - [Bước 4: Khởi chạy Backend](#bước-4-khởi-chạy-backend)
   - [Bước 5: Cài đặt và khởi chạy Frontend](#bước-5-cài-đặt-và-khởi-chạy-frontend)
4. [Hướng dẫn trải nghiệm các tính năng](#4-hướng-dẫn-trải-nghiệm-các-tính-năng)
5. [Cấu hình Docker (Tùy chọn cho SQL Server)](#5-cấu-hình-docker-tùy-chọn-cho-sql-server)
6. [Cấu trúc thư mục dự án](#6-cấu-trúc-thư-mục-dự-án)
7. [Danh sách REST API chính](#7-danh-sách-rest-api-chính)
8. [Kiểm thử hệ thống (Testing)](#8-kiểm-thử-hệ-thống-testing)
9. [Xử lý lỗi thường gặp (Troubleshooting)](#9-xử-lý-lỗi-thường-gặp-troubleshooting)

---

## 1. Tổng quan & Tính năng chính

### 🎯 Nhận diện AI & Xử lý Video
- **Phát hiện biển số (YOLOv8):** Nhận diện biển số xe máy và ô tô, hỗ trợ cả định dạng biển 1 dòng và 2 dòng chuẩn Việt Nam (model trọng số huấn luyện sẵn tại `models/plate_detector.pt`).
- **Đọc ký tự quang học (EasyOCR):** Tiền xử lý ảnh (cân bằng độ sáng, khử nhiễu, làm thẳng) và giải mã ký tự biển số.
- **Theo vết phương tiện (IoU Tracker):** Theo dõi đối tượng qua từng khung hình (frame), tránh nhận diện lặp lại một xe nhiều lần trong video.
- **Xử lý nền (Background Processing):** Upload video dài, xử lý bất đồng bộ, cập nhật tiến trình % theo thời gian thực.
- **Truy vết lịch sử (Trace):** Tìm kiếm hành trình phương tiện qua nhiều camera hoặc các video đã upload.

### 🅿️ Quản lý bãi đỗ xe thông minh (Smart Parking)
- **Quản lý Camera làn Vào/Ra (Entry/Exit):** Kết nối camera RTSP từ IP camera hoặc dùng Webcam máy tính (`rtsp_url = "0"`).
- **Xem trước & Snapshot:** Xem ảnh chụp tức thời từ camera trực tiếp trên Web.
- **Check-in / Check-out tự động:** Tự động chụp xe, nhận diện biển số, ghi nhận thời gian vào/ra và lưu ảnh bằng chứng.
- **Phân loại vé & Tính phí tự động:**
  - *Xe cư dân (Resident):* Quản lý theo số căn hộ, hạn vé tháng, tự động miễn phí gửi xe khi check-out.
  - *Khách vãng lai (Guest):* Tính tiền tự động theo biểu phí (ô tô/xe máy, theo giờ gửi).
- **Đối soát an ninh:** Cảnh báo và kiểm tra khớp biển số giữa lúc vào và lúc ra (`is_plate_matched`).
- **Dashboard Thống kê:** Báo cáo tổng số lượt xe, xe đang đỗ trong bãi, công suất bãi và doanh thu theo ngày.

---

## 2. Yêu cầu hệ thống

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các công cụ sau:

- **Hệ điều hành:** Windows 10/11, macOS, hoặc Linux (Ubuntu 20.04+).
- **Python:** Phiên bản **3.10** hoặc **3.11** (khuyến nghị 3.10/3.11 để tương thích tốt nhất với PyTorch và EasyOCR).
- **Node.js:** Phiên bản **18.x** hoặc **20.x** LTS (kèm `npm`).
- **Phần cứng:**
  - CPU tối thiểu 4 lõi, RAM tối thiểu 8GB (khuyến nghị 16GB nếu chạy đồng thời nhiều pipeline video).
  - Có card đồ họa NVIDIA (CUDA) sẽ giúp pipeline AI chạy nhanh hơn, nhưng hệ thống vẫn chạy tốt trên CPU.
- **Cơ sở dữ liệu (tùy chọn 1 trong 3):**
  - **SQLite:** Đã tích hợp sẵn trong Python, **không cần cài đặt thêm bất kỳ phần mềm nào** (khuyến nghị cho chạy thử nghiệm cá nhân).
  - **MySQL (8.0+ / 9.0+):** Phù hợp môi trường web/dev thông dụng (cổng 3306).
  - **Microsoft SQL Server:** Phù hợp môi trường doanh nghiệp hoặc chạy qua Docker (cổng 1433).

---

## 3. Hướng dẫn cài đặt và chạy dự án (Từng bước)

### Bước 1: Chuẩn bị mã nguồn

Mở terminal (PowerShell, Command Prompt hoặc Bash) và điều hướng vào thư mục dự án:

```bash
cd Real-time-license-plate-recognition-system
```

Kiểm tra thư mục `models/`: File mô hình `models/plate_detector.pt` đã được tích hợp sẵn trong repository.

---

### Bước 2: Cài đặt và cấu hình Backend

#### 2.1. Tạo môi trường ảo Python (Virtual Environment)

**Trên Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```
*(Nếu gặp lỗi PowerShell chặn script, chạy lệnh: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` rồi chạy lại lệnh activate)*

**Trên Windows (Command Prompt - CMD):**
```bat
python -m venv .venv
.venv\Scripts\activate.bat
```

**Trên Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

#### 2.2. Nâng cấp pip và cài đặt thư viện phụ thuộc

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install python-multipart pytest httpx pymysql
```

> **Lưu ý:**
> - `python-multipart`: Bắt buộc để FastAPI nhận file upload ảnh/video.
> - `pymysql`: Cần nếu bạn sử dụng cơ sở dữ liệu MySQL.
> - Khi EasyOCR chạy lần đầu tiên, nó sẽ tự động tải weights mô hình nhận diện chữ (khoảng 80MB) từ internet về thư mục `~/.EasyOCR/`.

---

### Bước 3: Lựa chọn và cấu hình Cơ sở dữ liệu

Hệ thống hỗ trợ cơ chế tự động nhận diện và fallback cơ sở dữ liệu rất linh hoạt. Hãy tạo một file `.env.local` ở **thư mục gốc** của dự án (cùng cấp với `main.py`).

Chọn **MỘT** trong các cấu hình dưới đây:

#### 👉 LỰA CHỌN A: Dùng SQLite (Khuyến nghị - Nhanh nhất, không cần cài đặt DB)
Tạo file `.env.local` với nội dung:
```dotenv
DB_ENGINE=sqlite
```
*Hệ thống sẽ tự động tạo file cơ sở dữ liệu và bảng tương ứng tại `data/alpr.db` khi khởi động backend.*

#### 👉 LỰA CHỌN B: Dùng MySQL (Nếu máy đã có XAMPP, WampServer hoặc MySQL Server)
Nếu bạn có MySQL đang chạy tại cổng `3306`:
```dotenv
DB_ENGINE=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DB=ALPR_DB
MYSQL_USER=root
MYSQL_PASSWORD=123456789
```
*Lưu ý thay `MYSQL_PASSWORD` bằng mật khẩu MySQL của bạn. Hệ thống sẽ tự động tạo database `ALPR_DB` và các bảng nếu chưa có.*

#### 👉 LỰA CHỌN C: Dùng Microsoft SQL Server
Nếu máy đã cài SQL Server hoặc chạy SQL Server qua Docker:
```dotenv
DB_ENGINE=sqlserver
SQLSERVER_HOST=localhost
SQLSERVER_PORT=1433
SQLSERVER_DB=ALPR_DB
SQLSERVER_USER=sa
SQLSERVER_PASSWORD=YourStrong@Pass123
SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server
SQLSERVER_TRUSTED=no
```

> **Mẹo:** Bạn có thể chạy script kiểm tra nhanh kết nối cơ sở dữ liệu bất cứ lúc nào bằng lệnh:
> ```bash
> python scripts/check_database_connections.py
> ```

---

### Bước 4: Khởi chạy Backend

Khởi động server Backend bằng lệnh:

```bash
python main.py
```

Khi khởi động thành công, terminal sẽ in ra bảng thông báo:
```text
====================================================================
 🚀 SMART ALPR 2.0 BACKEND SERVER (PARKING & LICENSE PLATE SYSTEM)
====================================================================
 • Cơ sở dữ liệu  : SQLITE / MYSQL / SQL SERVER
 • Tên Database   : ALPR_DB
 • Trạng thái DB  : Kết nối thành công
 • API Base URL   : http://localhost:8000/api/v1
 • Swagger Docs   : http://localhost:8000/docs
 • ReDoc          : http://localhost:8000/redoc
 • Next.js Client : http://localhost:3000
====================================================================
```

Kiểm tra trên trình duyệt:
- **Tài liệu API (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Kiểm tra trạng thái Health:** [http://localhost:8000/health](http://localhost:8000/health)

---

### Bước 5: Cài đặt và khởi chạy Frontend

Mở một **cửa sổ Terminal mới** (giữ nguyên cửa sổ Backend đang chạy):

1. Điều hướng vào thư mục `frontend`:
   ```bash
   cd frontend
   ```

2. Kiểm tra file `.env.local` ở **thư mục gốc dự án** đã có các biến frontend (gộp chung với backend):
   ```dotenv
   NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
   NEXT_PUBLIC_WS_URL=ws://localhost:8000
   NEXT_TELEMETRY_DISABLED=1
   ```
   (Frontend tự đọc các biến này từ `.env.local` ở root; không cần tạo `frontend/.env.local`.)

3. Cài đặt các gói phụ thuộc (nếu chưa cài):
   ```bash
   npm install
   ```

4. Khởi chạy máy chủ giao diện Next.js:
   ```bash
   npm run dev
   ```

5. Mở trình duyệt và truy cập:
   👉 **[http://localhost:3000](http://localhost:3000)**

---

## 4. Hướng dẫn trải nghiệm các tính năng

Sau khi cả Backend (`:8000`) và Frontend (`:3000`) đều đã hoạt động, bạn có thể thực hiện các thao tác:

### 1. Thêm camera giám sát & Kiểm tra Webcam máy tính
1. Vào mục **Cameras** (`http://localhost:3000/cameras`).
2. Bấm nút **"Thêm camera mới"**:
   - **Tên:** Camera Làn Vào 1
   - **Loại:** `ENTRY` (Làn vào) hoặc `EXIT` (Làn ra)
   - **RTSP URL:** Nhập số `0` để sử dụng trực tiếp **Webcam tích hợp trên máy tính**, hoặc nhập đường dẫn RTSP của camera IP (ví dụ: `rtsp://admin:pass@192.168.1.100:554/stream1`).
3. Bấm **"Kiểm tra kết nối"** để hệ thống lấy frame snapshot xem trước trực tiếp trên giao diện.

### 2. Thử nghiệm Check-in / Check-out xe bãi đỗ
- **Check-in bằng Upload ảnh hoặc Camera:**
  - Gửi ảnh xe qua giao diện hoặc gọi API `POST /api/v1/parking/check-in/upload`.
  - Hệ thống tự động nhận diện biển số, gắn nhãn thời gian, lưu ảnh toàn cảnh và ảnh crop biển số.
- **Check-out:**
  - Gọi API hoặc bấm Check-out bằng biển số: Hệ thống đối soát xe với lúc vào, tự động tính tổng thời gian đỗ, tính phí dựa trên loại vé (Cư dân: 0đ, Khách: theo bảng giá) và cập nhật trạng thái đã thanh toán.

### 3. Tải video nhận diện biển số & Theo vết (Tracing)
1. Vào mục **Upload Video** (`http://localhost:3000/upload`).
2. Chọn file video xe cộ (định dạng `.mp4`, `.avi`, `.mkv`).
3. Hệ thống sẽ tiếp nhận và xử lý ngầm (Background Task). Tiến độ (%) và số frame đã quét sẽ được hiển thị.
4. Sau khi hoàn tất:
   - Vào mục **Plates** để tra cứu danh sách toàn bộ các biển số nhận diện được cùng độ tin cậy và ảnh crop.
   - Vào mục **Trace** để nhập một biển số (ví dụ: `30A-123.45`) và xem dòng thời gian (timeline) xuất hiện của phương tiện.

### 4. Đăng ký xe cư dân (Vé tháng)
- Gọi API `POST /api/v1/parking/residents` để thêm xe cư dân (biển số, chủ xe, số căn hộ, ngày hết hạn vé). Xe cư dân khi vào/ra sẽ tự động được nhận diện diện ưu tiên miễn phí.

---

## 5. Cấu hình Docker (Tùy chọn cho SQL Server)

Nếu muốn chạy Microsoft SQL Server trong container Docker mà không cần cài trực tiếp vào máy tính:

1. Chạy container SQL Server từ file `docker-compose.yml` có sẵn:
   ```bash
   docker compose up -d sqlserver
   ```
2. Đảm bảo cấu hình trong file `.env.local` ở thư mục gốc:
   ```dotenv
   DB_ENGINE=sqlserver
   SQLSERVER_HOST=localhost
   SQLSERVER_PORT=1433
   SQLSERVER_DB=ALPR_DB
   SQLSERVER_USER=sa
   SQLSERVER_PASSWORD=YourStrong@Pass123
   SQLSERVER_DRIVER=ODBC Driver 18 for SQL Server
   SQLSERVER_TRUSTED=no
   ```
3. Khởi động backend `python main.py` như bình thường.

---

## 6. Cấu trúc thư mục dự án

```text
Real-time-license-plate-recognition-system/
├── api/
│   ├── app.py                      # Cấu hình FastAPI, middleware CORS, mount static
│   └── routes/
│       ├── analytics.py            # API thống kê KPI, báo cáo doanh thu bãi xe
│       ├── parking.py              # API camera, check-in/out, quản lý xe cư dân
│       ├── plates.py               # API tra cứu biển số, truy vết phương tiện
│       └── videos.py               # API upload video và theo dõi tiến độ
├── config/
│   ├── settings.py                 # Cấu hình toàn cục, đọc file .env.local
│   └── camera_config.json          # Cấu hình danh sách camera ban đầu
├── data/
│   ├── alpr.db                     # Cơ sở dữ liệu SQLite mặc định (tự sinh)
│   ├── captures/                   # Ảnh crop biển số từ luồng video
│   ├── parking_captures/           # Ảnh snapshot và crop xe vào/ra bãi
│   └── sample_videos/              # Thư mục lưu video upload
├── frontend/                       # Ứng dụng giao diện Next.js 14 (App Router)
│   ├── src/app/                    # Các trang: Dashboard, Upload, Cameras, Plates, Trace
│   ├── src/components/             # Component UI (Navbar, CameraCard, KPIWidget, ...)
│   ├── src/lib/api.ts              # Axios client kết nối tới Backend FastAPI
│   ├── package.json
│   └── .env.local                  # Cấu hình môi trường cho Next.js
├── models/
│   └── plate_detector.pt           # Trọng số mô hình YOLOv8 nhận diện biển số (đã train)
├── scripts/
│   ├── check_database_connections.py # Script kiểm tra nhanh kết nối DB
│   ├── train_detector.py           # Script huấn luyện YOLOv8 trên tập dữ liệu mới
│   └── evaluate_detector.py        # Đánh giá độ chính xác mô hình (mAP, Precision, Recall)
├── src/
│   ├── core/
│   │   ├── detector.py             # PlateDetector (YOLOv8 inference, crop ROI)
│   │   ├── tracker.py              # VehicleTracker (IoU Tracker theo dõi vết xe)
│   │   └── ocr.py                  # PlateOCR (EasyOCR + tiền xử lý + hậu xử lý regex)
│   ├── database/
│   │   ├── connection.py           # Kết nối linh hoạt SQLite / MySQL / SQL Server
│   │   ├── repository.py           # Tầng nghiệp vụ CRUD cơ sở dữ liệu
│   │   └── schema_*.sql            # Kịch bản tạo bảng cho từng hệ quản trị CSDL
│   ├── pipeline/
│   │   ├── alpr_pipeline.py        # Pipeline đọc video -> detect -> track -> ocr -> lưu DB
│   │   ├── camera_connector.py     # Kết nối RTSP/webcam, snapshot, xử lý vào/ra
│   │   └── stream_reader.py        # Đọc frame từ video với OpenCV
│   └── utils/
│       ├── image_processing.py     # Tiền xử lý ảnh (deskew, tăng tương phản, resize)
│       ├── plate_validator.py      # Chuẩn hóa biển số xe Việt Nam
│       └── logger.py               # Cấu hình ghi log hệ thống
├── tests/                          # Bộ kiểm thử tự động pytest
├── docker-compose.yml              # Khởi chạy SQL Server container
├── main.py                         # Điểm khởi chạy chính Backend (Uvicorn Server)
├── requirements.txt                # Danh sách thư viện Python
└── README.md                       # Hướng dẫn dự án
```

---

## 7. Danh sách REST API chính

Swagger UI đầy đủ và tài liệu tương tác có tại: `http://localhost:8000/docs`

| Phân hệ | Phương thức | Endpoint | Mô tả |
|---|---|---|---|
| **Hệ thống** | `GET` | `/health` hoặc `/api/v1/health` | Kiểm tra tình trạng backend |
| **Thống kê** | `GET` | `/api/v1/analytics/kpis` | Thống kê số lượng xe, doanh thu, phiên gửi xe |
| **Video** | `POST` | `/api/v1/videos/upload` | Upload video (hỗ trợ `.mp4`, `.mkv`, `.avi`, ...) |
| | `GET` | `/api/v1/videos/jobs` | Danh sách tiến độ các video đang xử lý |
| | `GET` | `/api/v1/videos/jobs/{job_id}` | Xem chi tiết tiến độ xử lý của một video |
| **Biển số** | `GET` | `/api/v1/plates/records` | Lấy danh sách biển số đã nhận diện (có tìm kiếm, phân trang) |
| | `GET` | `/api/v1/plates/trace` | Truy vết lịch sử xuất hiện của biển số xe |
| **Camera** | `GET` | `/api/v1/parking/cameras` | Danh sách cấu hình camera trong hệ thống |
| | `POST` | `/api/v1/parking/cameras` | Thêm mới hoặc cập nhật thông tin camera |
| | `POST` | `/api/v1/parking/cameras/{id}/test`| Kiểm tra kết nối tới camera RTSP/Webcam |
| | `GET` | `/api/v1/parking/cameras/{id}/snapshot`| Lấy ảnh JPEG chụp trực tiếp từ camera |
| **Bãi xe** | `POST` | `/api/v1/parking/check-in` | Thực hiện Check-in xe tự động qua camera |
| | `POST` | `/api/v1/parking/check-in/upload` | Check-in xe bằng file ảnh chụp gửi lên |
| | `POST` | `/api/v1/parking/check-out` | Thực hiện Check-out xe qua camera |
| | `POST` | `/api/v1/parking/check-out/upload` | Check-out xe bằng file ảnh chụp gửi lên |
| | `GET` | `/api/v1/parking/sessions` | Lịch sử các phiên gửi xe (đang đỗ, đã ra) |
| | `GET` | `/api/v1/parking/residents` | Danh sách xe cư dân đăng ký vé tháng |
| | `POST` | `/api/v1/parking/residents` | Đăng ký mới hoặc gia hạn vé tháng cho cư dân |

---

## 8. Kiểm thử hệ thống (Testing)

Dự án đi kèm bộ test tự động kiểm thử từ mức unit cho đến tích hợp toàn bộ pipeline:

Kích hoạt môi trường ảo và chạy:

```bash
# Chạy toàn bộ các bài test
python -m pytest -v

# Chạy riêng kiểm thử API
python -m pytest tests/test_api.py -v

# Chạy riêng kiểm thử luồng bãi đỗ xe & Database
python -m pytest tests/test_parking_db.py -v

# Chạy kiểm thử trọn vẹn luồng AI Pipeline
python -m pytest tests/test_real_pipeline.py -v
```

---

## 9. Xử lý lỗi thường gặp (Troubleshooting)

### ❓ 1. Lỗi `No module named 'multipart'` khi upload video hoặc ảnh
**Nguyên nhân:** Thiếu thư viện xử lý multipart form của FastAPI.  
**Cách xử lý:** Chạy lệnh:
```bash
pip install python-multipart
```

### ❓ 2. Next.js (`npm run dev`) bị treo lâu trước khi báo "Ready"
**Nguyên nhân:** Mạng chặn hoặc chập chờn khi kết nối tới registry npm để kiểm tra telemetry.  
**Cách xử lý:** Đảm bảo file `.env.local` ở thư mục gốc dự án có dòng:
```dotenv
NEXT_TELEMETRY_DISABLED=1
```
Sau đó nhấn `Ctrl + C` và chạy lại `npm run dev`.

### ❓ 3. Lỗi kết nối Database `SQL Server does not exist or access denied`
**Nguyên nhân:** Máy tính chưa mở SQL Server hoặc thông tin port/user/pass trong cấu hình chưa đúng.  
**Cách xử lý:**
- Nếu không bắt buộc dùng SQL Server, hãy mở file `.env.local` ở thư mục gốc và sửa lại:
  ```dotenv
  DB_ENGINE=sqlite
  ```
  Hệ thống sẽ chạy với SQLite cực kỳ ổn định và mượt mà mà không cần bất kỳ dịch vụ database ngoài nào.

### ❓ 4. Kiểm tra webcam máy tính báo lỗi kết nối
**Nguyên nhân:** Ứng dụng khác (Zoom, Teams, Camera app của Windows) đang chiếm dụng webcam.  
**Cách xử lý:**
- Đóng các ứng dụng đang dùng camera.
- Khi thêm camera trên Web, đặt `rtsp_url` là chuỗi `"0"`. Nếu máy có nhiều camera (ví dụ webcam rời gắn ngoài), thử đổi thành `"1"` hoặc `"2"`.

### ❓ 5. EasyOCR xử lý chậm trong lần đầu nhận diện
**Nguyên nhân:** Lần đầu chạy, thư viện EasyOCR tải model mạng nơ-ron từ máy chủ về máy và khởi tạo bộ nhớ đệm trên CPU.  
**Cách xử lý:** Chờ 30-60 giây để quá trình tải và khởi tạo hoàn tất. Từ các lượt nhận diện tiếp theo, thời gian xử lý sẽ nhanh hơn đáng kể.

---

Chúc bạn cài đặt và trải nghiệm thành công hệ thống **SMART ALPR 2.0**! 🚀
