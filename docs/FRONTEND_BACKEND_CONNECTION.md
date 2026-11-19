# Kết nối frontend – backend

## Khởi chạy

Từ thư mục gốc, chạy backend:

```powershell
python main.py
```

Mở terminal khác:

```powershell
cd frontend
npm run dev
```

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/api/v1/health`
- Swagger: `http://localhost:8000/docs`

Frontend đọc `.env.local` ở thư mục gốc:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Khởi động lại Next.js sau khi đổi biến môi trường. Có thể bỏ `NEXT_PUBLIC_WS_URL`
để suy ra WebSocket từ URL REST. Khi truy cập qua máy khác trong LAN, dùng IP của
máy chạy backend thay cho `localhost`.

## Hợp đồng đang dùng

- REST: `/api/v1/analytics`, `/api/v1/videos`, `/api/v1/plates`,
  `/api/v1/parking`, `/api/v1/settings`.
- WebSocket: `/ws` hoặc `/api/v1/ws`; nhận `handshake`, gửi `ping` → nhận `pong`.
- Sự kiện video: `video_job_created`, `video_job_updated` (có `job_id`),
  `plate_detected`, `video_job_deleted`, `kpis_updated`.
- Sự kiện bãi xe: `parking_check_in`, `parking_check_out`.
- Media: `/media/`, `/static/uploads/`, `/static/captures/`,
  `/static/parking/`, `/static/videos/`; frontend nối với origin backend.
- Upload từ giao diện lưu job/kết quả vào MySQL; lịch sử vẫn đọc được sau khi
  backend khởi động lại. Trang Upload polling dự phòng mỗi 5 giây.
- Xóa video đang xử lý trả `409`; xóa video hoàn tất xóa cả bản ghi liên quan,
  file upload và thư mục output riêng của job.

## Kiểm tra

```powershell
python -m pytest tests/test_frontend_contract.py -q
cd frontend
node --test tests/endpoints.test.cjs
npm run build
```

Bộ test backend tạo database MySQL `alpr_contract_<id>` và media tạm, rồi dọn
database test khi kết thúc. Cần tài khoản MySQL có quyền tạo/xóa database test.
AI được thay bằng kết quả xác định trong test hợp đồng; đây không phải benchmark OCR.

Nếu muốn build trong lúc `npm run dev` đang chạy, dùng thư mục build riêng:

```powershell
$env:NEXT_DIST_DIR = ".next-build"
npm run build
Remove-Item Env:NEXT_DIST_DIR
```
