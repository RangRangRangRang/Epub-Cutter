# EPUB Cắt Chương
PWA thuần HTML/CSS/JS (không build, không npm). Việc chính: ghép nhiều quyển epub, làm sạch (xóa note/watermark/link/icon, sửa *lời thoại* → "lời thoại"), cắt theo khoảng chương, xuất epub mới gồm Quyển - Mục lục (bấm nhảy chương) - Chương - nội dung. Kế hoạch gốc: kehoach-epub-cutter.md.
- Luồng: epub-read.js (đọc + rút chữ từng chương) → epub-clean.js (làm sạch) → epub-build.js (dựng epub mới từ đầu, không giữ ảnh/bìa/CSS gốc) → app.js (giao diện).
- Muốn thêm kiểu watermark: sửa NOTE_HEAD / KEY_LINE trong epub-clean.js. Dấu nối "Quyển 1 - Tên": hằng SEP.
- Tên biến/file tiếng Anh; giao diện + comment tiếng Việt; hàm ngắn; try/catch mọi thao tác file, báo lỗi dễ hiểu.
- Không bao giờ sửa file gốc. JSZip ghim 3.10.1 trong assets/js.
- Sửa code xong nhớ đổi `V` trong sw.js.
