# 🚗 SMART ALPR 2.0 - HỆ THỐNG NHẬN DIỆN BIỂN SỐ XE THỜI GIAN THỰC & QUẢN LÝ BÃI XE THÔNG MINH

[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js 14](https://img.shields.io/badge/Next.js-14.2-000000?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![YOLOv8/v11](https://img.shields.io/badge/YOLO-Ultralytics-00FFFF?style=flat)](https://github.com/ultralytics/ultralytics)
[![MySQL 8/9](https://img.shields.io/badge/MySQL-8.0%2B%20%7C%209.0%2B-4479A1?style=flat&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

Hệ thống nhận diện biển số xe tự động (**Automatic License Plate Recognition - ALPR**) ứng dụng Trí tuệ nhân tạo Deep Learning kết hợp giải pháp **Quản lý bãi đỗ xe thông minh theo thời gian thực** dành cho tòa nhà, khu đô thị và chung cư.

Dự án được xây dựng theo kiến trúc Micro-services hiện đại: Backend **FastAPI** hiệu năng cao, Giao diện quản trị **Next.js 14 (App Router & Bento Grid)** và cơ sở dữ liệu **MySQL Server**.

---

## 📌 Mục lục

1. [Tính năng nổi bật](#1-tính-năng-nổi-bật)
2. [Yêu cầu hệ thống](#2-yêu-cầu-hệ-thống)
3. [Hướng dẫn cài đặt & Khởi chạy (Chỉ cần 1 lần duy nhất)](#3-hướng-dẫn-cài-đặt--khởi-chạy-chỉ-cần-1-lần-duy-nhất)
   - [Bước 1: Tải mã nguồn](#bước-1-tải-mã-nguồn)
   - [Bước 2: Cài đặt Backend Python](#bước-2-cài-đặt-backend-python)
   - [Bước 3: Cài đặt Frontend Next.js](#bước-3-cài-đặt-frontend-nextjs)
   - [Bước 4: Cấu hình Cơ sở dữ liệu MySQL](#bước-4-cấu-hình-cơ-sở-dữ-liệu-mysql)
   - [Bước 5: Khởi chạy dự án](#bước-5-khởi-chạy-dự-án)
4. [Các phân hệ giao diện chính](#4-các-phân-hệ-giao-diện-chính)
5. [Cấu trúc thư mục dự án](#5-cấu-trúc-thư-mục-dự-án)
6. [Danh mục REST API chính](#6-danh-mục-rest-api-chính)
7. [Kiểm thử tự động (Testing)](#7-kiểm-thử-tự-động-testing)
8. [Xử lý lỗi thường gặp (Troubleshooting)](#8-xử-lý-lỗi-thường-gặp-troubleshooting)

---

## 1. Tính năng nổi bật

### 🎯 Pipeline Trí tuệ Nhân tạo 3 Tầng (Deep Learning ALPR)
*   **Phát hiện vị trí biển số (`plate_detector.pt`)**: YOLO phát hiện biển số xe ô tô, xe máy, biển vuông 2 dòng và biển dài 1 dòng chuẩn Việt Nam.
*   **Phân loại phương tiện (`vehicle_detector.pt`)**: Nhận diện xe con (`car`), xe máy (`motorcycle`), xe tải (`truck`), xe buýt (`bus`).
*   **Đọc ký tự quang học 2 lớp (Hybrid OCR)**:
    *   *Tầng 1:* `plate_char_detector.pt` (YOLO định vị từng ký tự A-Z, 0-9).
    *   *Tầng 2:* **EasyOCR** (ResNet + BiLSTM + CTC) tiền xử lý và giải mã chuẩn xác trong điều kiện ngược sáng, góc nghiêng.
*   **Bộ lọc bỏ phiếu (Voting Filter & Tracking)**: Theo dõi xe qua các frame bằng IoU Tracker, tự động lấy kết quả có độ tin cậy cao nhất và chuẩn hóa định dạng biển số VN (ví dụ: `51F-882.34`).
*   **Smart Early-Exit Optimization**: Nhận diện xe tức thì và vẽ khung bounding box mượt mà mà không làm nghẽn CPU.

### 🅿️ Quản lý Vận hành Bãi xe Thông minh (Smart Parking)
*   **Check-in / Check-out tự động**: Tự động nhận diện biển số, chụp ảnh bằng chứng toàn cảnh và ảnh crop biển số, ghi nhận thời gian vào/ra.
*   **Phân loại vé & Tính phí thông minh**:
    *   *Xe cư dân:* Tự động nhận diện căn hộ và miễn phí gửi xe (vé tháng).
    *   *Khách vãng lai:* Tự động tính cước theo biểu phí linh hoạt (ban ngày, ban đêm, giờ đầu tiên, block giờ tiếp theo, thời gian ân hạn miễn phí).
*   **Quản lý xe cư dân theo căn hộ**: Danh sách căn hộ, tên chủ xe, số điện thoại, biển số đăng ký, mã thẻ RFID, hạn vé tháng.
*   **Đối soát chống tráo xe**: Cảnh báo tức thời nếu loại xe hoặc biển số lúc ra không trùng khớp với lúc vào.

### 📹 Luồng Camera Trực tiếp & Truy vết Phương tiện
*   **Live Stream độ trễ cực thấp (< 100ms)**: Hỗ trợ cả Webcam máy tính và link RTSP từ Camera IP giám sát cổng.
*   **Truy vết biển số (Trace Deck)**: Tìm kiếm lịch sử ra vào theo thời gian, theo camera/video và biển số xe hỗ trợ tìm gần đúng (Levenshtein tolerance).
*   **Xem Video AI & Video bằng chứng**: Modal phát video có tua đến đúng thời điểm xe xuất hiện (`pts_ms`), hỗ trợ xem cả video gốc và video đã được AI vẽ khung nhận diện.

---

## 2. Yêu cầu hệ thống

*   **Hệ điều hành**: Windows 10/11, macOS, hoặc Linux (Ubuntu 20.04+).
*   **Python**: Phiên bản **3.10** đến **3.14** (khuyến nghị 3.10 - 3.12).
*   **Node.js**: Phiên bản **18.x** hoặc **20.x LTS** (kèm `npm`).
*   **Cơ sở dữ liệu**: **MySQL 8.0+** hoặc **MySQL 9.0+** (đang chạy tại cổng `3306`).
*   **Phần cứng**:
    *   CPU: Tối thiểu 4 lõi, RAM tối thiểu 8GB.
    *   GPU (Tùy chọn): Card đồ họa NVIDIA hỗ trợ CUDA giúp tăng tốc độ quét lên 30 - 60 FPS (mặc định hệ thống vẫn chạy mượt trên CPU).

---

## 3. Hướng dẫn cài đặt & Khởi chạy (Chỉ cần 1 lần duy nhất)

### Bước 1: Tải mã nguồn

Mở Terminal và điều hướng vào thư mục dự án:
```bash
cd Real-time-license-plate-recognition-system
```

Kiểm tra thư mục `data/models/` đã có đủ 3 file trọng số mô hình:
- `data/models/plate_detector.pt`
- `data/models/vehicle_detector.pt`
- `data/models/plate_char_detector.pt`

---

### Bước 2: Cài đặt Backend Python

Khuyến khích tạo môi trường ảo (virtual environment) để tránh xung đột thư viện:

**Trên Windows (PowerShell):**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```
*(Nếu PowerShell báo lỗi `ExecutionPolicy`, chạy: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` rồi chạy lại)*

**Trên Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Cài đặt trọn bộ thư viện Backend chỉ với 1 lệnh:**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```
> File `requirements.txt` đã bao gồm đầy đủ 100% thư viện: PyTorch, Ultralytics YOLO, EasyOCR, OpenCV, FastAPI, Uvicorn, PyMySQL, Cryptography, v.v.

---

### Bước 3: Cài đặt Frontend Next.js

Mở cửa sổ Terminal mới (hoặc chuyển vào thư mục `frontend`):

```bash
cd frontend
npm install
cd ..
```
> Lệnh `npm install` sẽ tự động tải toàn bộ React 18, Next.js 14, Tailwind CSS, Lucide Icons, Axios và các công cụ cần thiết.

---

### Bước 4: Cấu hình Cơ sở dữ liệu MySQL

Hệ thống đã có sẵn cấu hình mặc định kết nối MySQL cục bộ. Bạn chỉ cần đảm bảo MySQL service đang chạy trên máy (XAMPP, WampServer, MySQL Workbench hoặc Docker):
*   **Host**: `127.0.0.1`
*   **Cổng**: `3306`
*   **User mặc định**: `root`
*   **Mật khẩu mặc định**: `123456789`
*   **Database**: `alpr`

*(Nếu mật khẩu MySQL của bạn khác, hãy tạo file `.env` hoặc `.env.local` ở thư mục gốc và điền thông tin tương ứng như mẫu trong `.env.example`)*:
```dotenv
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=Mật_Khẩu_Của_Bạn
MYSQL_DATABASE=alpr
```
> **Đặc biệt:** Khi khởi động Backend lần đầu, hệ thống sẽ **tự động khởi tạo database `alpr` và toàn bộ 5 bảng cần thiết** (`jobs`, `plate_records`, `cameras`, `resident_vehicles`, `parking_sessions`). Bạn không cần phải import thủ công bất kỳ file `.sql` nào!

---

### Bước 5: Khởi chạy dự án

#### 🔹 Cửa sổ 1: Chạy Backend (FastAPI + YOLO + MySQL)
Tại thư mục gốc của dự án:
```bash
python main.py
```
Server sẽ khởi động tại `http://localhost:8000`:
*   **Trang API Health**: [http://localhost:8000](http://localhost:8000)
*   **Tài liệu tương tác Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
*   **Tài liệu ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

#### 🔹 Cửa sổ 2: Chạy Frontend (Next.js 14)
Mở cửa sổ Terminal thứ hai:
```bash
cd frontend
npm run dev
```
Giao diện sẽ chạy tại [http://localhost:3000](http://localhost:3000).

---

## 4. Các phân hệ giao diện chính

| Đường dẫn | Tên phân hệ | Chức năng nổi bật |
| :--- | :--- | :--- |
| `/` | **Tổng quan (Dashboard)** | Xem số liệu KPI, sức chứa bãi xe theo thời gian thực, xem camera cổng và danh sách biển số xe vừa qua cổng. |
| `/parking` | **Quản lý Bãi xe** | Thực hiện Check-in / Check-out xe, tính tiền tự động theo biểu phí ngày/đêm, lọc phiên gửi xe đang đỗ (`PARKED`) hoặc đã ra (`COMPLETED`). |
| `/residents` | **Xe Cư dân** | Quản lý phương tiện đăng ký theo căn hộ, chủ xe, số điện thoại, cấp thẻ vé tháng tự động miễn phí gửi xe. |
| `/trace` | **Truy vết Biển số** | Tìm kiếm biển số xe có hỗ trợ sai số Levenshtein, lọc theo ngày giờ, xem ảnh crop nét cao và video bằng chứng tua đúng giây ghi nhận. |
| `/upload` | **Upload & Xử lý** | Tải lên hàng loạt video camera giao thông, thanh tiến trình % và FPS làm tròn gọn gàng, xem video AI có vẽ bounding box biển số. |
| `/camera` & `/cameras` | **Camera Cổng bãi** | Kết nối trực tiếp Webcam hoặc RTSP IP Camera với độ trễ cực thấp (< 100ms), quản lý camera làn vào và làn ra. |
| `/settings` | **Cài đặt Hệ thống** | Cài đặt biểu phí gửi xe linh hoạt, tùy chỉnh ngưỡng tin cậy AI, dọn dẹp dung lượng đĩa và kiểm tra kết nối MySQL. |

---

## 5. Cấu trúc thư mục dự án

```text
Real-time-license-plate-recognition-system/
├── api/                             # FastAPI Backend Layer
│   ├── app.py                       # Khởi tạo FastAPI App, CORS, Static mounts
│   ├── camera_manager.py            # Quản lý luồng trực tiếp từ camera / webcam
│   ├── video_manager.py             # Hàng đợi background worker xử lý video upload
│   ├── serializers.py               # Chuyển đổi dữ liệu và URL media
│   └── routes/                      # Các endpoint API RESTful
│       ├── analytics.py             # API KPIs & thống kê
│       ├── camera.py                # API bắt đầu/dừng stream camera
│       ├── parking.py               # API check-in, check-out, cư dân
│       ├── plates.py                # API tìm kiếm và truy vết biển số
│       ├── settings.py              # API biểu phí, lưu trữ, trạng thái DB
│       └── videos.py                # API upload video, quản lý job
├── config/
│   └── settings.py                  # Cấu hình ngưỡng AI, MySQL, đường dẫn lưu trữ
├── data/
│   ├── captures/                    # Ảnh crop biển số xe độ nét cao
│   ├── models/                      # Chứa 3 weights mô hình YOLO (.pt)
│   ├── output/                      # Kết quả video AI kết xuất (_annotated.mp4)
│   └── uploads/                     # Thư mục chứa video người dùng tải lên
├── frontend/                        # Next.js 14 Client App (App Router)
│   ├── package.json                 # Danh mục thư viện Frontend
│   └── src/
│       ├── app/                     # Các trang: /, /parking, /residents, /trace, /upload, /settings
│       ├── components/              # Bento UI, Modal xem video, Video scanner, Camera card
│       ├── lib/                     # Client gọi API Axios, SSE Hook, Media resolver
│       └── types/                   # Định nghĩa TypeScript Types
├── src/                             # Lõi thuật toán AI & Data Access
│   ├── core/                        # YOLO Detector, Hybrid OCR, IoU Tracker
│   ├── database/                    # Kết nối MySQL (PyMySQL) & Repository CRUD
│   ├── pipeline/                    # Pipeline xử lý video và stream camera
│   ├── utils/                       # Chuẩn hóa biển số VN, xử lý ảnh, logger
│   └── models.py                    # Khai báo dữ liệu PlateRecord, VideoJob
├── tests/                           # Bộ kiểm thử tự động pytest
├── main.py                          # File thực thi khởi chạy Backend Server
├── requirements.txt                 # Toàn bộ danh mục thư viện Python
└── README.md                        # Hướng dẫn chi tiết dự án
```

---

## 6. Danh mục REST API chính

| Nhóm | Method | Endpoint | Mô tả chức năng |
| :--- | :---: | :--- | :--- |
| **Hệ thống** | `GET` | `/health` | Kiểm tra trạng thái hoạt động của server |
| **Thống kê** | `GET` | `/api/v1/analytics/kpis` | Lấy các chỉ số KPI: Tổng xe, độ chính xác, xe trong bãi |
| **Phân tích Video**| `POST` | `/api/v1/videos/upload` | Upload video lên server và đưa vào hàng đợi AI |
| | `GET` | `/api/v1/videos/jobs` | Danh sách tiến độ và trạng thái các video |
| | `GET` | `/api/v1/videos/jobs/{id}` | Chi tiết kết quả và video AI đã kết xuất |
| **Biển số xe** | `GET` | `/api/v1/plates/records` | Lấy danh sách biển số đã nhận diện (hỗ trợ tìm kiếm, lọc) |
| | `GET` | `/api/v1/plates/trace` | Truy vết hành trình xuất hiện của biển số xe |
| **Bãi xe thông minh**| `POST` | `/api/v1/parking/check-in` | Check-in xe tự động, nhận diện biển và lưu ảnh vào |
| | `POST` | `/api/v1/parking/check-out`| Check-out xe, đối chiếu biển số, tự tính cước phí |
| | `GET` | `/api/v1/parking/sessions` | Lấy lịch sử các phiên gửi xe (đang đỗ / đã ra) |
| | `GET` | `/api/v1/parking/stats` | Thống kê doanh thu, xe cư dân, xe khách trong bãi |
| **Xe Cư dân** | `GET` | `/api/v1/parking/residents`| Danh sách xe cư dân đã đăng ký theo căn hộ |
| | `POST` | `/api/v1/parking/residents`| Thêm mới hoặc cập nhật xe cư dân, thẻ RFID |
| **Camera Cổng** | `POST` | `/api/cameras/start` | Khởi động kết nối camera (Webcam `0` hoặc RTSP) |
| | `GET` | `/api/cameras/stream` | Stream luồng hình ảnh MJPEG độ trễ thấp về web |
| | `POST` | `/api/cameras/stop` | Dừng luồng camera |
| **Cài đặt** | `GET` | `/api/v1/settings` | Lấy bảng biểu phí, ngưỡng AI, cấu hình lưu trữ |
| | `PUT` | `/api/v1/settings` | Lưu cấu hình biểu phí và tham số hệ thống |
| | `GET` | `/api/v1/settings/database/status`| Kiểm tra kết nối và số lượng bản ghi MySQL |

---

## 7. Kiểm thử tự động (Testing)

Dự án có sẵn bộ test tích hợp toàn diện bằng `pytest` để kiểm thử API và database:

```bash
# Chạy bộ kiểm thử tự động
python -m pytest tests/test_api.py -v
```

Kết quả kiểm thử tiêu chuẩn:
```text
tests/test_api.py::test_health_check PASSED                   [ 20%]
tests/test_api.py::test_analytics_kpis PASSED                 [ 40%]
tests/test_api.py::test_video_upload_and_job_lifecycle PASSED [ 60%]
tests/test_api.py::test_plates_records_and_trace PASSED       [ 80%]
tests/test_api.py::test_settings_and_tariffs PASSED           [100%]
======================== 5 passed in 8.86s ========================
```

---

## 8. Xử lý lỗi thường gặp (Troubleshooting)

### ❓ 1. Lỗi kết nối MySQL: `Access denied for user 'root'@'localhost'`
*   **Nguyên nhân:** Mật khẩu root của MySQL trên máy tính khác với mật khẩu mặc định `123456789`.
*   **Cách khắc phục:** Mở file `.env` ở thư mục gốc (hoặc tạo mới từ `.env.example`) và sửa lại `MYSQL_PASSWORD=Mật_Khẩu_Thực_Tế_Của_Bạn`.

### ❓ 2. Camera báo lỗi kết nối hoặc màn hình đen
*   **Nguyên nhân:** Ứng dụng khác (Zoom, Teams, Camera Windows) đang chiếm dụng webcam.
*   **Cách khắc phục:** Tắt các ứng dụng đang dùng camera và chọn lại nguồn camera là `0`. Nếu dùng camera rời cổng USB, hãy thử đổi thành `1` hoặc `2`.

### ❓ 3. EasyOCR khởi động chậm trong lần chạy đầu tiên
*   **Nguyên nhân:** Khi chạy lần đầu, EasyOCR sẽ tự động tải trọng số mô hình OCR chuẩn (~80MB) từ internet về thư mục người dùng (`~/.EasyOCR/`).
*   **Cách khắc phục:** Đảm bảo máy có kết nối internet trong lần chạy đầu. Các lần khởi động tiếp theo hệ thống sẽ nạp trực tiếp từ ổ cứng với tốc độ nhanh tức thì.

---

Chúc bạn có trải nghiệm tuyệt vời khi khám phá và ứng dụng hệ thống **SMART ALPR 2.0**! 🚀
