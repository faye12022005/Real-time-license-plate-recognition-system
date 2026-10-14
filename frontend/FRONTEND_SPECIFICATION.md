# TÀI LIỆU ĐẶC TẢ DỰ ÁN FRONTEND (FRONTEND SPECIFICATION)
## DỰ ÁN: SMART ALPR 2.0 — HỆ THỐNG NHẬN DIỆN & TRUY VẾT BIỂN SỐ XE
### Thiết kế Giao diện: BRIGHT TECH BENTO DASHBOARD
### Công nghệ: Next.js 14 (App Router) + TypeScript + Tailwind CSS + Lucide Icons

---

## 1. MỤC TIÊU & PHẠM VI NGHIỆP VỤ (PROJECT SCOPE)

Dự án Frontend được xây dựng theo tiêu chí **tinh gọn, trực quan, chuyên sâu**, tập trung tuyệt đối vào **3 chức năng cốt lõi**:

```
+------------------+       +---------------------------------+       +---------------------+
| 1. UPLOAD VIDEO  | ----> | 2. NHẬN DIỆN BIỂN SỐ & LƯU DB   | ----> | 3. TRUY VẾT BIỂN SỐ |
| MP4, MKV, AVI    |       | Quét AI từng frame, trích xuất  |       | Tìm kiếm wildcard,  |
| Tiến trình kép   |       | biển số, loại xe, mốc thời gian |       | timeline, xem video |
+------------------+       +---------------------------------+       +---------------------+
```

1. **Tải lên Video (Video Upload):** Người dùng tải lên tệp video camera giao thông (hỗ trợ kéo thả, dung lượng tối đa 1GB). Hệ thống hiển thị tiến trình tải và thanh tiến trình kép phân tích AI (Chuyển mã 20% + AI 80%).
2. **Nhận diện Biển số xe & Lưu trữ Database:** Phân tích toàn bộ khung hình trong video (zero-drop), tự động nhận diện tất cả biển số xe (biển số chuẩn hóa, tỉnh thành, loại phương tiện, mốc thời gian xuất hiện, ảnh crop biển số) và lưu vĩnh viễn vào cơ sở dữ liệu.
3. **Truy vết Biển số xe (Plate Trace & Forensic Investigation):** Tra cứu biển số xe theo chuỗi ký tự hoặc ký tự đại diện wildcard (`51F*`, `59P2*`), hiển thị hồ sơ phương tiện, dòng thời gian (timeline) xuất hiện qua các video khác nhau và cho phép xem lại video tại đúng mốc thời gian xuất hiện.

---

## 2. NGÔN NGỮ THIẾT KẾ: BRIGHT TECH BENTO DASHBOARD

Tuân thủ nguyên tắc thiết kế **Bright Tech Bento Dashboard**:
- **Bản sắc thị giác:** Kết hợp phong cách công nghệ mạnh mẽ của **MSI App Player** với triết lý khối mô-đun **Apple Bento Grid** và tính tiện dụng của SaaS Dashboard chuyên nghiệp.
- **Tone màu sáng chủ đạo (Bright Palette):**
  - Nền chính (Main Background): `#F8FAFC`
  - Bề mặt thẻ (Surface): `#FFFFFF`
  - Màu phân cách nhẹ (Muted Surface): `#F1F5F9`
  - Màu công nghệ chủ đạo (Primary Tech Blue): `#2563EB` (Hover: `#1D4ED8`, Light: `#EFF6FF`)
  - Màu điểm xuyết cảnh báo (Accent Red): `#FF3B30`
  - Chữ chính (Primary Text): `#0F172A`, Chữ phụ: `#475569`, Chữ mờ: `#64748B`
  - Viền phân cách (Border): `#E2E8F0`
  - Màu ngữ nghĩa: Thành công `#16A34A`, Cảnh báo `#D97706`, Lỗi `#DC2626`
- **Typography:**
  - Tiêu đề & Nhãn công nghệ: *Space Grotesk* hoặc *Inter Bold*.
  - Thân văn bản: *Inter*.
  - Biển số xe & Chỉ số kỹ thuật: *Roboto Mono*.

---

## 3. CẤU TRÚC 3 VÙNG KHÔNG GIAN GIAO DIỆN

### 3.1. Vùng A: Sidebar Điều hướng Dọc (Persistent Sidebar)
- **Vị trí:** Cố định bên trái màn hình (`w-64`, dính chặt khi cuộn `sticky top-0 h-screen`).
- **Nội dung:**
  - Logo ALPR TECH 2.0 kèm biểu tượng CPU công nghệ.
  - Menu 4 mục chức năng chính:
    1. 🏠 **Tổng quan Bento (`/`):** Dashboard tổng hợp tất cả chỉ số và tác vụ nhanh.
    2. 📹 **Tải lên & Xử lý Video (`/upload`):** Khu vực upload chuyên sâu và lịch sử tác vụ.
    3. 📋 **Kho Biển số (Database) (`/plates`):** Danh mục toàn bộ biển số xe đã bóc tách.
    4. 🔍 **Truy vết Biển số (`/trace`):** Công cụ điều tra hành trình xe theo thời gian.
  - **Trạng thái Active:** Nền xanh nhạt `#EFF6FF`, viền `#BFDBFE`, chữ xanh `#2563EB`.
  - Phía dưới cùng: Trạng thái kết nối AI Engine Online (đèn xanh nhấp nháy pulse) và thông tin tài khoản người vận hành.

### 3.2. Cấu trúc Không gian Làm việc (Không Header Dư thừa)
- **Tối ưu hóa tầm nhìn:** Loại bỏ hoàn toàn thanh Header topbar cố định để giải phóng tối đa chiều cao hiển thị cho khu vực phát video và luồng dữ liệu thời gian thực.
- **Không gian Làm việc Chính (Bento Grid Workspace):**
  - Chiều rộng tối đa: `1440px`, tự động căn giữa, khoảng cách viền đệm cân đối (`padding: 24–32px`).
  - Sử dụng CSS Grid 12 cột (`grid-cols-12`) linh hoạt cho các kích thước màn hình.
  - Các module Bento có góc bo tròn `14px`, viền mỏng `#E2E8F0`, đổ bóng nhẹ `shadow-bento` và hiệu ứng lướt chuột mượt mà (`hover:shadow-bento-hover`).

---

## 4. CHI TIẾT CÁC MODULE VÀ TRANG GIAO DIỆN

### 4.1. Trang Tổng quan Bento (`/` - `src/app/page.tsx`)

Bao gồm các khối Bento phân cấp thông tin rõ ràng:
1. **Module Trung tâm: Bộ Xử lý Nhận diện Biển số Thời gian thực (`RealtimeVideoScanner`):**
   - **Trình phát Video trực quan:** Xem trực tiếp video tải lên từ máy tính (`.mp4`, `.mkv`, `.avi`) hoặc sử dụng video mẫu thử nghiệm (Demo Sample).
   - **Vẽ Bounding Box thời gian thực (Canvas Overlay 60 FPS):** Vẽ khung nhận diện quanh xe di chuyển theo từng giây kèm nhãn công nghệ `[Loại xe] #[ID] | [Biển số] ([Độ chính xác %])` và khung quét biển số.
   - **Bảng Biển số Bóc tách Thời gian thực (Real-time Live Plate Feed):** Biển số được AI quét đến giây nào sẽ nhảy ngay ra danh sách bên cạnh. Bấm vào biển số bất kỳ, video sẽ tự động tua ngay đến đúng mốc thời gian xuất hiện.
   - **Thanh điều khiển Video chuyên nghiệp:** Play/Pause, Scrubber tua video, hiển thị thời gian phút:giây, chỉnh tốc độ phát (0.5x, 1x, 1.5x, 2x), nút bật/tắt tiếng.
2. **KPI Metric Cards (4 Khối vuông/chữ nhật):**
   - *Tổng Video Phân tích:* Số lượng video đã được xử lý.
   - *Tổng Lượt Nhận diện:* Tổng số biển số xe được phát hiện qua các khung hình.
   - *Biển số Duy nhất (DB):* Số lượng xe độc lập được lưu trong CSDL.
   - *Độ chính xác OCR TB:* Tỷ lệ % độ tin cậy nhận diện.
3. **Module Kép Phía Dưới (Grid 12 Cột):**
   - *Cột 5/12 (Truy vết Phương tiện Nhanh):* Tra cứu lịch sử xuất hiện và hành trình phương tiện qua các video.
   - *Cột 7/12 (Biển số Đã Lưu Cơ sở Dữ liệu):* Danh sách biển số xe trích xuất thành công và lưu trữ vĩnh viễn.

---

### 4.2. Trang Tải lên & Xử lý Video (`/upload` - `src/app/upload/page.tsx`)

- **Hàng đợi Tải lên Đa tệp Bất đồng bộ (Multi-file Async Upload Queue Zone):**
  - **Kéo thả nhiều tệp cùng lúc:** Hỗ trợ kéo thả hoặc chọn nhiều tệp `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm` đồng thời.
  - **Kiểm tra tính hợp lệ Client-side:**
    - Kiểm tra tệp rỗng (0-byte) hoặc hỏng.
    - Kiểm tra dung lượng tối đa 1GB mỗi tệp (`MAX_FILE_SIZE = 1GB`).
    - Kiểm tra đuôi mở rộng và MIME video.
    - Nếu tệp không đạt, đánh dấu ngay trạng thái `ERROR` kèm thông báo lỗi trực quan mà không chặn các tệp hợp lệ khác trong đợt kéo thả.
  - **Kiểm soát đồng thời (Concurrency Control):**
    - Giới hạn tải lên tối đa 2 tệp song song (`MAX_CONCURRENT_UPLOADS = 2`) để bảo vệ tài nguyên mạng và bộ nhớ trình duyệt.
    - Các tệp còn lại nằm ở trạng thái `QUEUED` (Chờ tải) và được worker tự động kích hoạt tuần tự theo cơ chế FIFO.
  - **Thao tác Hàng đợi:**
    - Hủy tải từng tệp (`AbortController` cắt luồng axios ngay lập tức).
    - Thử lại từng tệp lỗi (`Retry`) hoặc thử lại tất cả tệp lỗi (`Retry All Failed`).
    - Xóa tệp hoàn tất khỏi danh sách (`Clear Completed`).
- **Trình chiếu HUD Quét Video Thời Gian Thực (Realtime Video Scanner):**
  - Trình phát Video HTML5 kết hợp Canvas overlay 60 FPS vẽ Bounding Box thời gian thực quanh phương tiện và biển số.
  - Bảng trích xuất biển số tức thì (Live Plate Stream) theo thời gian video phát.
  - Khả năng click vào biển số nhận diện để tua video (seek) đến đúng giây phương tiện xuất hiện.
- **Thanh Tiến Trình Kép (Dual Progress Bar):**
  $$\text{Tiến trình Tổng} = (\text{Chuyển mã / Upload} \times 0.20) + (\text{Phân tích AI YOLO/OCR} \times 0.80)$$
- **Bảng Đo đạc Thời gian thực:**
  - Hiển thị tốc độ xử lý AI thực tế (FPS).
  - Khung hình đã phân tích / Tổng khung hình (`processed_frames / total_frames`).
  - Thời gian ước tính còn lại (ETA tính bằng giây).
  - Số lượng biển số xe đã tìm thấy.
- **Bảng Lịch sử Tác vụ (Jobs History):**
  - Tên tệp video, trạng thái (`COMPLETED` / `PROCESSING`), tiến trình %, số biển số nhận diện, thời điểm tải lên, tốc độ FPS.


---

### 4.3. Trang Kho Biển số trong Database (`/plates` - `src/app/plates/page.tsx`)

- **Bộ lọc & Tìm kiếm:**
  - Ô tìm kiếm biển số có hỗ trợ lọc tức thì.
  - Dropdown lọc theo loại phương tiện: Tất cả, Ô tô con (`car`), Xe máy (`motorcycle`), Xe buýt (`bus`), Xe tải (`truck`).
- **Bảng Dữ liệu Biển số Toàn diện:**
  - **Ảnh Crop Biển số:** Thumbnail ảnh crop sắc nét độ phân giải cao trích xuất từ khung hình.
  - **Biển số Xe:** Hiển thị dưới dạng huy hiệu biển số chuẩn Việt Nam (biển trắng chữ đen viền đen, biển vàng xe kinh doanh dịch vụ).
  - **Tỉnh thành:** Tự động tra cứu mã đầu số địa phương (51/59: TP.HCM, 29/30: Hà Nội, 43: Đà Nẵng,...).
  - **Loại xe:** Huy hiệu màu sắc riêng biệt (Ô tô: Cyan, Xe máy: Emerald, Xe tải: Pink, Xe buýt: Amber).
  - **Video Nguồn:** Tên tệp video chứa phương tiện.
  - **Mốc thời gian (Timestamp & PTS):** Hiển thị phút:giây xuất hiện trong video (VD: `00:14`, `01:22`).
  - **Độ tin cậy OCR:** Tỷ lệ % độ tin cậy của thuật toán nhận diện.
  - **Nút "Truy vết":** Nhảy thẳng sang trang truy vết hành trình của xe đó.

---

### 4.4. Trang Truy vết Biển số & Xem lại Bằng chứng (`/trace` - `src/app/trace/page.tsx`)

- **Công cụ Tìm kiếm Wildcard:**
  - Cho phép tìm kiếm chính xác (VD: `51F-882.34`) hoặc tìm tương đối / ký tự đại diện (VD: `51F*`, `59P2*`, `29A*`).
  - Tự động nhận tham số từ URL `?q=...`.
- **Hồ sơ Phương tiện (Vehicle Profile Card):**
  - Biển số phóng to chuẩn thiết kế, phân loại màu biển.
  - Tỉnh thành đăng ký và loại phương tiện.
  - Tổng số lần nhìn thấy và số lượng video khác nhau phương tiện đã xuất hiện.
  - Ảnh chụp crop rõ nét nhất của xe.
- **Dòng thời gian Di chuyển (Timeline History):**
  - Liệt kê theo thứ tự thời gian tất cả các lần phương tiện xuất hiện.
  - Hiển thị tên video nguồn, mốc thời gian xuất hiện trong video (`video_time_str` và mili-giây PTS), tốc độ ước tính.
- **Trình phát Video Bằng chứng (VideoEvidenceModal):**
  - Bấm nút **"Xem lại Video"** trên timeline sẽ mở modal phát video.
  - Thẻ video HTML5 tự động tua đúng mốc thời gian xuất hiện của xe.
  - HUD overlay trên video hiển thị biển số, mốc thời gian và điểm số nhận diện.

---

## 5. HỢP ĐỒNG DỮ LIỆU TYPESCRIPT (DATA CONTRACTS)

Tệp định nghĩa: [`src/types/index.ts`](file:///d:/Khanh/Python/Real-time-license-plate-recognition-system/frontend/src/types/index.ts)

```typescript
// 1. Tác vụ Xử lý Video
export interface VideoJob {
  id: string;
  filename: string;
  file_size_bytes: number;
  stage: "UPLOADED" | "TRANSCODING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  stage_progress_pct: number;
  overall_progress_pct: number;
  total_frames: number;
  processed_frames: number;
  duration_seconds: number;
  current_fps: number;
  eta_seconds: number;
  detected_plates_count: number;
  created_at: string;
}

// 2. Bản ghi Nhận diện Biển số (Database Record)
export interface PlateRecord {
  id: string;
  job_id: string;
  job_filename: string;
  track_id: number;
  plate_number: string;        // "51F88234"
  plate_display: string;       // "51F-882.34"
  province: string;            // "TP. Hồ Chí Minh"
  plate_type: "white" | "yellow" | "blue" | "red";
  vehicle_type: "car" | "motorcycle" | "bus" | "truck";
  confidence_score: number;    // 0.98
  quality_score: number;
  crop_image_url: string;
  pts_ms: number;              // 14200 (ms)
  video_time_str: string;      // "00:14"
  timestamp: string;
  speed_kmh?: number;
}

// 3. Tóm tắt Truy vết Biển số (Trace Summary)
export interface PlateTraceSummary {
  plate_number: string;
  plate_display: string;
  province: string;
  vehicle_type: VehicleType;
  plate_type: PlateColor;
  total_detections: number;
  distinct_videos: number;
  first_seen: string;
  last_seen: string;
  best_crop_image_url: string;
  records: PlateRecord[];
}
```

---

## 6. HƯỚNG DẪN CÀI ĐẶT & KHỞI CHẠY (QUICK START)

1. **Cài đặt thư viện:**
   ```bash
   cd frontend
   npm install
   ```

2. **Chạy máy chủ phát triển:**
   ```bash
   npm run dev
   ```
   Mở trình duyệt tại: `http://localhost:3000`

3. **Chế độ Giao diện Trống & Xem trước Dữ liệu mẫu (Empty State & Mock Preview):**
   - **Mặc định:** Hệ thống khởi chạy ở chế độ **Giao diện Trống (Empty State)** (`NEXT_PUBLIC_USE_MOCK=false`) để bạn kiểm tra toàn bộ trạng thái khi hệ thống chưa có dữ liệu.
   - **Xem trước Dữ liệu mẫu:** Khi muốn xem trước dữ liệu mẫu (Mock Data), bạn chỉ cần bấm nút **"Xem trước Dữ liệu Mẫu"** ở góc dưới Sidebar hoặc trên các thẻ Empty State. Hệ thống sẽ tự động nạp toàn bộ dữ liệu mẫu mà không cần khởi động lại server.
