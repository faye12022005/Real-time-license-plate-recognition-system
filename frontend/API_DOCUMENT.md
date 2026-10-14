# API DOCUMENT — SMART ALPR 2.0 FRONTEND

> **Tác giả:** AI Assistant (theo FRONTSPEC + `src/lib/api.ts` + `src/types/index.ts`)
> **Dự án:** SMART ALPR 2.0 — Hệ thống Nhận diện Biển số & Truy vết xe
> **Ngôn ngữ:** Tiếng Việt (phù hợp team Việt)
> **Công nghệ Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS + Lucide Icons
> **Base URL:** `http://localhost:8000/api/v1` (định nghĩa trong `NEXT_PUBLIC_API_URL` hoặc `.env.local`)

---

## MỤC LỤC

1. [Tổng quan Kiến trúc API](#tổng-quan-kiến-trúc-api)
2. [Loại Dữ liệu (Data Types / Contracts)](#loại-dữ-liệu-data-contracts)
3. [Danh sách Endpoint](#danh-sách-endpoint)
4. [Chi tiết từng Endpoint](#chi-tiết-từng-endpoint)
5. [Chế độ Mock (Mock Mode)](#chế-độ-mock-mock-mode)
6. [Xác thực & Token](#xác-thực--token)
7. [Cấu trúc File Mã nguồn](#cấu-trúc-file-mã-nguồn)
8. [Ví dụ Sử dụng API từ Frontend](#ví-dụ-sử-dụng-api-từ-frontend)
9. [Môi trường & Biến Cấu hình](#môi-trường--biến-cấu-hình)
10. [Quy trình Phát triển & Kiểm thử](#quy-trình-phát-triển--kiểm-thử)
11. [Phụ lục: Mock Data Sample](#phụ-lục-mock-data-sample)

---

## 1. TỔNG QUAN KIẾN TRÚC API

Frontend được xây dựng theo mẫu **Bento Dashboard — Bright Tech** và tương tác với Backend qua lớp `axios` (`apiClient`) tại `src/lib/api.ts`.

### Luồng dữ liệu chính (3 cột):

```
┌──────────────────┐    Upload    ┌──────────────────────┐    Truy vết     ┌──────────────────┐
│  UPLOAD VIDEO    │ ───────────► │  NHẬN DIỆN BIỂN SỐ  │ ───────────────► │   TRACE PLATE   │
│  (Drag & Drop)   │  POST /videos│ (YOLO + OCR)        │  GET /plates/trace │  (Wildcards)     │
└──────────────────┘              └──────────────────────┘                  └──────────────────┘
         │                           │                                  │
         └── GET /videos/jobs ───────┘                                  │
         └── GET /analytics/kpis ───┘                                  │
         └── GET /plates/records ──────────────────────────────────────┘
```

### Cấu trúc gọi từ `src/lib/api.ts`:

- `baseURL` = `NEXT_PUBLIC_API_URL` hoặc `"http://localhost:8000/api/v1"`
- `timeout` = `10000` ms (10 giây)
- Headers mặc định: `Content-Type: application/json`
- Interceptor thêm `Authorization: Bearer <token>` nếu `localStorage.access_token` tồn tại
- Nếu `isMockEnabled()` = `true`: API trả về dữ liệu từ `mockData.ts` (không gọi server thực)

---

## 2. LOẠI DỮ LIỆU (DATA CONTRACTS)

File định nghĩa: `frontend/src/types/index.ts`

### 2.1. VehicleType

```typescript
type VehicleType = "car" | "motorcycle" | "bus" | "truck";
```

### 2.2. PlateColor (Màu biển)

```typescript
type PlateColor = "white" | "yellow" | "blue" | "red";
```

### 2.3. JobStage (7 trạng thái vòng đời tác vụ)

```typescript
type JobStage = "UPLOADED" | "TRANSCODING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
```

### 2.4. VideoJob (Tác vụ xử lý video)

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `string` | Mã tác vụ (VD: `job-001`) |
| `filename` | `string` | Tên file gốc |
| `file_size_bytes` | `number` | Dung lượng file |
| `stage` | `JobStage` | Trạng thái |
| `stage_progress_pct` | `number` | Tiến trình giai đoạn (0–100) |
| `overall_progress_pct` | `number` | Tiến trình tổng (`Transcoding 20% + AI 80%`) |
| `total_frames` | `number` | Tổng số khung hình |
| `processed_frames` | `number` | Đã phân tích |
| `duration_seconds` | `number` | Độ dài video (giây) |
| `current_fps` | `number` | FPS thực tế |
| `eta_seconds` | `number` | Thời gian ước tính còn lại (giây) |
| `detected_plates_count` | `number` | Số biển số phát hiện |
| `video_url?` | `string` | URL video (mẫu) |
| `error_message?` | `string` | Lỗi (nếu có) |
| `created_at` | `string` | Thời điểm tạo (`ISO 8601`) |
| `completed_at?` | `string` | Thời điểm hoàn thành |

### 2.5. PlateRecord (Bản ghi Biển số)

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `id` | `string` | Mã bản ghi |
| `job_id` | `string` | Liên kết tác vụ |
| `job_filename` | `string` | Tên video nguồn |
| `track_id` | `number` | ID theo dõi |
| `plate_number` | `string` | Biển số chuẩn hóa (VD: `"51F88234"`) |
| `plate_display` | `string` | Biển số hiển thị (VD: `"51F-882.34"`) |
| `province` | `string` | Tỉnh/Thành phố (VD: `"TP. Hồ Chí Minh"`) |
| `plate_type` | `PlateColor` | Màu biển |
| `vehicle_type` | `VehicleType` | Loại xe |
| `confidence_score` | `number` | Độ tin cậy OCR (`0.0 – 1.0`) |
| `quality_score` | `number` | Điểm chất lượng hình ảnh (`0.0 – 1.0`) |
| `crop_image_url` | `string` | URL ảnh crop biển số |
| `pts_ms` | `number` | Mốc thời gian xuất hiện (mili-giây từ đầu video) |
| `video_time_str` | `string` | Định dạng `phút:giây` (VD: `"01:22"`) |
| `timestamp` | `string` | Thời điểm phát hiện (`ISO 8601`) |
| `speed_kmh?` | `number` | Vận tốc ước tính (`km/h`) |

### 2.6. PlateTraceSummary (Hồ sơ Truy vết)

| Trường | Kiểu |
|---|---|
| `plate_number` | `string` |
| `plate_display` | `string` |
| `province` | `string` |
| `vehicle_type` | `VehicleType` |
| `plate_type` | `PlateColor` |
| `total_detections` | `number` | Số lần phát hiện |
| `distinct_videos` | `number` | Số video khác nhau |
| `first_seen` | `string` | Lần đầu (`ISO 8601`) |
| `last_seen` | `string` | Lần cuối (`ISO 8601`) |
| `best_crop_image_url` | `string` | Ảnh crop rõ nhất |
| `records` | `PlateRecord[]` | Danh sách chi tiết |

### 2.7. DashboardKPIs (Chỉ số KPI)

| Trường | Kiểu |
|---|---|
| `total_videos` | `number` | Số video đã xử lý |
| `total_plates_detected` | `number` | Tổng số biển số phát hiện |
| `unique_plates_count` | `number` | Số xe độc lập (DB) |
| `avg_accuracy_pct` | `number` | Tỷ lệ % độ chính xác trung bình |

---

## 3. DANH SÁCH ENDPOINT

Tất cả endpoint đều trả về `Content-Type: application/json`. Nếu xảy ra lỗi mạng, hàm `catch` trong `api.ts` trả về giá trị rỗng mặc định (`[]`, `{}`, `undefined`).

| # | Endpoint | Method | Mô tả | File nguồn |
|---|---|---|---|---|
| 1 | `/analytics/kpis` | `GET` | Lấy KPI dashboard | `api.ts` → `getKPIs()` |
| 2 | `/videos/upload` | `POST` (multipart) | Tải lên video mới | `api.ts` → `uploadVideo()` |
| 3 | `/videos/jobs` | `GET` | Danh sách tác vụ video | `api.ts` → `getJobs()` |
| 4 | `/videos/jobs/{job_id}` | `GET` | Chi tiết một tác vụ | `api.ts` → `getJobById()` |
| 5 | `/plates/records` | `GET` | Danh sách biển số đã lưu | `api.ts` → `getPlates()` |
| 6 | `/plates/trace` | `GET` (query: `plate`) | Truy vết hành trình xe | `api.ts` → `tracePlate()` |

---

## 4. CHI TIẾT TỪNG ENDPOINT

### 4.1. `GET /analytics/kpis`

**Mục đích:** Lấy 4 chỉ số KPI cho Dashboard Bento.

**Response (200):**

```json
{
  "total_videos": 18,
  "total_plates_detected": 342,
  "unique_plates_count": 219,
  "avg_accuracy_pct": 98.4
}
```

**Mock:** `MOCK_KPIS` từ `mockData.ts`

---

### 4.2. `POST /videos/upload`

**Headers:** `Content-Type: multipart/form-data`

**Body:** `FormData` chứa `file` (`File` object từ trình duyệt — `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`)

**Hỗ trợ:** `onProgress` callback (0-100%) và `signal` (`AbortSignal`) để hủy tác vụ.

**Response (200):**

```json
{
  "job_id": "job-1716547200123"
}
```

**Mã lỗi Backend xử lý (Error Handling):**
- `413 Payload Too Large`: Dung lượng tệp vượt quá giới hạn cấu hình (1GB).
- `422 Unprocessable Entity`: Định dạng tệp không hợp lệ hoặc video bị lỗi phân mảnh/không đọc được frame.
- `507 Insufficient Storage`: Dung lượng máy chủ không đủ lưu trữ.
- `ECONNABORTED`: Quá thời gian timeout mạng.
- `AbortError`: Client chủ động hủy luồng upload.


---

### 4.3. `GET /videos/jobs`

**Response (200):**

```json
[
  {
    "id": "job-001",
    "filename": "nga_tu_hang_xanh_peak_hour.mp4",
    "file_size_bytes": 145000000,
    "stage": "COMPLETED",
    "stage_progress_pct": 100,
    "overall_progress_pct": 100,
    "total_frames": 4500,
    "processed_frames": 4500,
    "duration_seconds": 150,
    "current_fps": 28,
    "eta_seconds": 0,
    "detected_plates_count": 86,
    "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    "created_at": "2026-10-13T10:15:00Z",
    "completed_at": "2026-10-13T10:17:40Z"
  }
]
```

---

### 4.4. `GET /videos/jobs/{job_id}`

**Response (200):** `VideoJob` (một object duy nhất).

---

### 4.5. `GET /plates/records`

**Query params (`getPlates()`):**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `q?` | `string` | Không | Tìm kiếm biển số (tự động chuẩn hóa: xóa `-` `.` rồi `toUpperCase`) |
| `vehicle_type?` | `string` (`car`/`motorcycle`/`bus`/`truck`/`all`) | Không | Lọc loại xe |
| `job_id?` | `string` | Không | Lọc theo tác vụ |

**Response (200):** Mảng `PlateRecord[]`

**Mock:** `MOCK_PLATES` từ `mockData.ts` — 7 bản ghi mẫu từ 3 video thực tế (`job-001`, `job-002`, `job-003`).

---

### 4.6. `GET /plates/trace`

**Query params (`tracePlate()`):**

| Param | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `plate` | `string` | Có | Biển số tìm kiếm (hỗ trợ wildcard — VD: `51F*`, `59P2*`). Hàm `getPlateTrace()` tự động chuẩn hóa (`toUpperCase()` + xóa `-` `.`) rồi tìm kiếm tương đối (`includes`). |

**Response (200):** Mảng `PlateTraceSummary[]`

**Mock logic (`getPlateTrace()`):**
1. Chuẩn hóa `queryPlate` (`toUpperCase`, bỏ `-.`)
2. Lọc `MOCK_PLATES` theo `plate_number.includes(queryNormalized)` hoặc `plate_display.toUpperCase().includes(queryPlate.toUpperCase())`
3. Nhóm theo `plate_number`
4. Sắp xếp theo `timestamp` → `first_seen` / `last_seen`
5. Tính `distinct_videos` = `Set(job_id)`
6. Trả về `PlateTraceSummary[]`

---

## 5. CHẾ ĐỘ MOCK (MOCK MODE)

### Cách bật:
1. Đặt `.env.local`: `NEXT_PUBLIC_USE_MOCK=true`
2. Hoặc mở trang `/` → bật Mock Mode từ UI → lưu vào `localStorage` (`alpr_use_mock`)

### Cơ chế hoạt động (`isMockEnabled()`):

```typescript
export function isMockEnabled(): boolean {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("alpr_use_mock");
    if (saved !== null) return saved === "true";
  }
  return process.env.NEXT_PUBLIC_USE_MOCK === "true";
}
```

**Khi Mock ON:** Tất cả 6 endpoint trả dữ liệu từ `mockData.ts` (không gọi `http://localhost:8000`).

**Khi Mock OFF (`.env.local` = `false` hoặc `localStorage` = `false`):** Gọi server thực (`baseURL` từ `.env`). Nếu lỗi mạng → trả về giá trị rỗng mặc định.

**Lưu ý quan trọng từ `FRONTEND_SPECIFICATION.md`:**
> **"Mặc định `.env.local` đã cấu hình `NEXT_PUBLIC_USE_MOCK=true`. Frontend có sẵn dữ liệu mẫu thực tế..."**
> **"Nếu muốn xem Giao diện Trống (Empty State): tắt Mock Mode."**

---

## 6. XÁC THỰC & TOKEN

- **Interceptor (`apiClient.interceptors.request`):**
  - Đọc `localStorage.getItem("access_token")`
  - Nếu tồn tại: thêm header `Authorization: Bearer <token>`
  - Nếu không có token: không thêm header (backend phải cho phép public read)

- **Mock Mode:** Không cần token.
- **Thực tế (Production):** Cần đăng nhập và lấy `access_token` rồi lưu vào `localStorage`.

---

## 7. CẤU TRÚC FILE MÃ NGUỒN

```
frontend/
├── src/
│   ├── types/index.ts              ← Data Contracts (VideoJob, PlateRecord, ...)
│   ├── lib/
│   │   ├── api.ts                   ← Tất cả 6 endpoint + axios client + mock switch
│   │   └── mockData.ts              ← Dữ liệu mẫu thực tế (3 video, 7 biển số, 1 trace)
│   ├── app/
│   │   ├── page.tsx                 ← Trang Tổng quan Bento (`/`)
│   │   ├── upload/page.tsx          ← Trang Upload (`/upload`)
│   │   ├── plates/page.tsx          ← Kho Biển số (`/plates`)
│   │   ├── trace/page.tsx           ← Truy vết (`/trace`)
│   │   ├── layout.tsx               ← Layout chính (Sidebar + Workspace)
│   │   └── globals.css
│   └── components/                 ← Các Component Bento (RealtimeVideoScanner, ...)
├── .env.local                       ← NEXT_PUBLIC_API_URL, NEXT_PUBLIC_USE_MOCK
├── FRONTEND_SPECIFICATION.md       ← Đặc tả thiết kế chi tiết (219 dòng)
```

---

## 8. VÍ DỤ SỬ DỤNG API TỪ FRONTEND

### 8.1. Gọi KPI Dashboard (`/analytics/kpis`)

```typescript
import { alprApi } from "@/lib/api";

const kpis = await alprApi.getKPIs();
// kpis.total_videos → 18 (nếu mock ON)
```

### 8.2. Tải lên Video (`POST /videos/upload`)

```typescript
const file = (e.target.files?.[0] as File);
const result = await alprApi.uploadVideo(file);
// result.job_id → "job-1716547200123"
```

### 8.3. Lấy danh sách biển số (`GET /plates/records`)

```typescript
const plates = await alprApi.getPlates({ q: "51F", vehicle_type: "car" });
// plates = [PlateRecord, ...]
```

### 8.4. Truy vết (`GET /plates/trace`)

```typescript
const trace = await alprApi.tracePlate("51F88234");
// trace = [PlateTraceSummary, ...] → chứa timeline, video links
```

---

## 9. MÔI TRƯỜNG & BIẾN CẤU HÌNH

### `.env.local` (Frontend):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_USE_MOCK=true
```

### `.env.local.example` (Mẫu):
Có sẵn trong repo.

---

## 10. QUY TRÌNH PHÁT TRIỂN & KIỂM THỬ

### 10.1. Cài đặt & Khởi động (Quick Start từ `FRONTEND_SPECIFICATION.md`):

```bash
cd frontend
npm install
npm run dev        # Mở tại http://localhost:3000
```

### 10.2. Kiểm tra Mock Mode:
1. Mở trang `/`
2. Nhìn Sidebar dưới cùng → đèn xanh nhấp nháy `AI Engine Online`
3. Nếu `.env.local` có `NEXT_PUBLIC_USE_MOCK=true` → dữ liệu mẫu hiển thị ngay
4. Nếu muốn xem Giao diện Trống → tắt Mock Mode → giao diện rỗng (`0` KPI, bảng trống)

### 10.3. Kiểm thử 3 chức năng cốt lõi:

```markdown
1. Upload Video (`/upload`):
   - Kéo thả `.mp4` / `.mkv` / `.avi`
   - Theo dõi thanh tiến trình kép (Transcoding 20% + AI 80%)
   - Xem bảng lịch sử tác vụ (Jobs History)

2. Kho Biển số (`/plates`):
   - Tìm kiếm `51F*` hoặc `29A*`
   - Lọc theo loại xe (`car`, `motorcycle`, `bus`, `truck`)
   - Bấm "Truy vết" → nhảy sang `/trace`

3. Truy vết (`/trace`):
   - Nhập biển số (`51F88234`, `59P2*`)
   - Xem Hồ sơ Phương tiện (Profile Card)
   - Xem Timeline History
   - Bấm "Xem lại Video" → mở modal phát video tại đúng mốc PTS
```

---

## 11. PHỤ LỤC: MOCK DATA SAMPLE

### 11.1. Mock KPI (`MOCK_KPIS`):

```typescript
{
  total_videos: 18,
  total_plates_detected: 342,
  unique_plates_count: 219,
  avg_accuracy_pct: 98.4,
}
```

### 11.2. Mock Video Jobs (`MOCK_JOBS` — 3 video mẫu thực tế):

| Job ID | Filename | Kích thước | Trạng thái | Biển số phát hiện | Fps | Video mẫu (URL công khai Google) |
|---|---|---|---|---|---|---|
| `job-001` | `nga_tu_hang_xanh_peak_hour.mp4` | 145MB | `COMPLETED` | 86 | 28 | `ForBiggerBlazes` |
| `job-002` | `cau_sai_gon_lane_inbound.mp4` | 98MB | `COMPLETED` | 64 | 29 | `ForBiggerEscapes` |
| `job-003` | `cao_toc_long_thanh_km12.mp4` | 230MB | `PROCESSING` (72%) | 53 | 26 | `BigBuckBunny` |

### 11.3. Mock Plates (`MOCK_PLATES` — 7 bản ghi từ 3 video):

Bao gồm các biển số thực tế từ TP.HCM, Hà Nội, Đà Nẵng; loại xe `car`, `motorcycle`, `bus`, `truck`; màu biển `white`, `yellow`; độ tin cậy `0.94 – 0.99`.

---

## TÓM TẮT NHANH CHO FRONTEND DEV

| Việc cần làm | File liên quan | Lệnh / Ghi chú |
|---|---|---|
| Gọi API từ component | `src/lib/api.ts` → `alprApi` | Dùng `await alprApi.getKPIs()` ... |
| Định nghĩa kiểu dữ liệu | `src/types/index.ts` | `VideoJob`, `PlateRecord`, `PlateTraceSummary` ... |
| Bật Mock | `.env.local` hoặc `localStorage` | `NEXT_PUBLIC_USE_MOCK=true` |
| Tắt Mock (xem giao diện trống) | Tắt `.env.local` hoặc `localStorage` = `false` | Giao diện sẽ rỗng (Empty State) |
| Xem dữ liệu mẫu | `src/lib/mockData.ts` | 3 video, 7 biển số, 1 trace |
| Chạy dev server | `npm run dev` (port `3000`) | Truy cập `/`, `/upload`, `/plates`, `/trace` |
