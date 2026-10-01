# Real-time License Plate Recognition System

Khung dự án Python cho hệ thống nhận diện biển số xe theo thời gian thực.

## Cấu trúc chính

- `config/`: cấu hình hệ thống và danh sách camera.
- `data/`: model AI, ảnh capture và video mẫu.
- `src/core/`: detector, OCR và tracker.
- `src/pipeline/`: đọc stream và điều phối pipeline ALPR.
- `src/utils/`: tiền xử lý ảnh, kiểm tra biển số và logging.
- `src/database/`: kết nối và repository dữ liệu.
- `api/`: REST/WebSocket API.
- `tests/`: kiểm thử detector và OCR.

## Chạy khung ứng dụng

```powershell
python main.py
```

Các module nghiệp vụ và model AI hiện là placeholder, sẵn sàng được triển khai ở bước tiếp theo.
