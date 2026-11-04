# Kế hoạch: EPUB Cắt Chương (app nhỏ cho Windows + Android)

## 1. Mục tiêu
Một app **chỉ làm một việc**: mở file truyện `.epub`, nhập "từ chương A đến chương B", xuất ra **file epub mới** chỉ chứa các chương đó, để gửi nhanh cho khách qua Zalo/Facebook.

Không làm: đọc truyện, thư viện, tài khoản, đồng bộ, thanh toán, quảng cáo.

## 2. Lựa chọn công nghệ (đề xuất: PWA)
| Phương án | Dung lượng | Một code cho cả 2 nền tảng | Độ khó với người không chuyên |
|---|---|---|---|
| **PWA (HTML/CSS/JS thuần)** | vài chục KB | Có | Dễ nhất |
| Flutter | 15–25 MB/bản | Có | Trung bình |
| Tauri + Android riêng | 5–10 MB (Windows) | Không hẳn | Khó |

**Chọn PWA** vì:
- Cùng stack với web hiện tại (HTML + JS thuần, không build, không npm).
- Mọi thứ xử lý **ngay trên máy**, file truyện không bị tải lên server nào (không lo lộ bản dịch).
- Host miễn phí trên GitHub Pages, cài như app: Edge/Chrome trên Windows ("Cài đặt ứng dụng"), Chrome trên Android ("Thêm vào màn hình chính"). Chạy được **offline** nhờ service worker.
- Android có nút **Chia sẻ** (Web Share API) gửi file thẳng sang Zalo/Messenger/Facebook.
- Thư viện ngoài duy nhất: `JSZip` (ghim phiên bản, chép hẳn vào repo để chạy offline).

Nếu sau này cần file `.exe` hoặc `.apk` thật: bọc lại PWA bằng Bubblewrap (Android) hoặc Tauri (Windows), không phải viết lại.

## 3. Luồng sử dụng (1 màn hình duy nhất)
1. Bấm **Chọn file EPUB** (hoặc kéo thả trên Windows).
2. App đọc và hiện: tên truyện, tác giả, **tổng số chương**, danh sách chương (cuộn được, có ô tìm).
3. Nhập **Từ chương [A] đến chương [B]** (hoặc chạm chọn chương đầu/cuối trong danh sách).
4. Xem trước: "Sẽ cắt N chương: tên chương đầu … tên chương cuối".
5. Bấm **Cắt & Lưu**: 
   - Windows: tải file về, tên dạng `Tên truyện - C101-200.epub`.
   - Android: nút **Chia sẻ** gửi thẳng cho khách + nút **Lưu**.

Tuỳ chọn nhỏ (nằm ở dòng cuối, không thêm màn hình): nhớ file vừa mở gần nhất để cắt tiếp nhiều đoạn liên tiếp.

## 4. Cách xử lý EPUB (phần quan trọng nhất)
EPUB thực chất là file ZIP.

**Đọc:**
1. Giải nén bằng JSZip.
2. `META-INF/container.xml` → đường dẫn file `.opf`.
3. `.opf` → `metadata` (tên, tác giả), `manifest` (mọi file), `spine` (thứ tự đọc).
4. Mục lục: `nav.xhtml` (EPUB3) hoặc `toc.ncx` (EPUB2) → danh sách chương theo thứ tự.

**Xác định "chương N":**
- Mỗi mục trong mục lục = 1 chương (theo thứ tự).
- Tách số từ tiêu đề bằng regex (`Chương 12`, `Chapter 12`, `Chương 12: …`) để người dùng nhập đúng số chương thật. Nếu không nhận diện được, dùng **số thứ tự mục lục** và báo rõ trên màn hình.
- Bỏ qua các mục không phải chương (bìa, lời giới thiệu, mục lục) khi đếm; cho phép bật/tắt "tính cả các mục đầu".
- Trường hợp mục lục trỏ vào **giữa** một file xhtml (neo `#id`): chương kết thúc ở mục kế tiếp; cắt theo neo bằng DOMParser. Trường hợp phổ biến hơn (mỗi chương một file) thì chỉ cần chọn file.

**Ghi epub mới:**
1. `mimetype` ghi **đầu tiên**, **không nén** (bắt buộc theo chuẩn, nếu sai nhiều app đọc sẽ từ chối).
2. Chép `META-INF/container.xml`.
3. Tạo `.opf` mới: giữ metadata, đổi tiêu đề thành `Tên truyện (Chương A–B)`, chỉ giữ các item của chương đã chọn trong manifest/spine, giữ lại CSS, font, ảnh mà các chương đó thực sự dùng, giữ ảnh bìa.
4. Tạo mục lục mới (`nav.xhtml` và `toc.ncx`) chỉ gồm các chương đã chọn.
5. Xuất Blob → tải/chia sẻ.

## 5. Cấu trúc thư mục
```
epub-cat-chuong/
├─ index.html          # giao diện 1 màn hình
├─ manifest.json       # để cài như app (tên, icon, màu)
├─ sw.js               # service worker: chạy offline
├─ assets/
│  ├─ style.css        # sáng/tối theo hệ thống, to rõ trên điện thoại
│  ├─ icon-192.png, icon-512.png
│  └─ js/
│     ├─ jszip.min.js  # ghim phiên bản, chép vào repo
│     ├─ epub-read.js  # đọc epub, lấy metadata + danh sách chương
│     ├─ epub-cut.js   # dựng epub mới từ chương A→B
│     └─ app.js        # giao diện, chọn file, nhập số, tải/chia sẻ
└─ CLAUDE.md
```
Quy ước giống dự án web hiện tại: tên biến/file tiếng Anh, giao diện và comment tiếng Việt, hàm ngắn, dễ sửa; `try/catch` mọi thao tác đọc/ghi file và báo lỗi dễ hiểu ("File này không phải EPUB hợp lệ", "Không tìm thấy mục lục").

## 6. Lộ trình
1. [ ] Dựng khung: `index.html` + chọn file + hiện tên truyện, tổng số chương (`epub-read.js`).
2. [ ] Nhận diện số chương, danh sách chương có ô tìm; thử với 3–5 epub thật của bạn (nhiều nguồn tạo epub khác nhau).
3. [ ] `epub-cut.js`: cắt theo A→B, xuất epub; kiểm tra mở được trong Calibre và app đọc trên điện thoại.
4. [ ] Xử lý trường hợp khó: nhiều chương trong 1 file (neo `#id`), epub2 chỉ có `toc.ncx`, tên chương không có số.
5. [ ] Windows: kéo thả file, tên file xuất tự động. Android: nút Chia sẻ, nút to dễ bấm.
6. [ ] PWA: `manifest.json`, icon, `sw.js` chạy offline.
7. [ ] Đưa lên GitHub Pages, cài thử trên Windows và Android.

## 7. Cách kiểm tra
- Cắt chương 1–10, mở file mới: đúng 10 chương, mục lục đúng, ảnh/font không vỡ.
- Cắt 1 chương duy nhất, cắt chương cuối, cắt toàn bộ (kết quả phải gần giống file gốc).
- Nhập A > B: app tự đổi chỗ hoặc báo lỗi; nhập vượt tổng số chương: báo rõ.
- Epub lớn (vài nghìn chương, 20–50 MB) trên điện thoại cũ: không treo, có thanh tiến trình.
- Kiểm tra hợp lệ bằng EPUBCheck (tuỳ chọn) hoặc mở trên ít nhất 2 app đọc.

## 8. Rủi ro và cách xử lý
| Rủi ro | Cách xử lý |
|---|---|
| Epub tạo từ nguồn khác nhau, cấu trúc lệch chuẩn | Thử nhiều file mẫu; luôn có chế độ dự phòng "đếm theo thứ tự mục lục" |
| File lớn làm tràn RAM điện thoại | Chỉ đọc nội dung các chương cần cắt, không nạp toàn bộ vào bộ nhớ |
| Một số trình duyệt Android không chia sẻ được file | Luôn có nút **Lưu** dự phòng |
| Mất bản dịch vì bug | App không bao giờ sửa file gốc, chỉ tạo file mới |

## 9. Mở rộng sau này (ngoài phạm vi hiện tại)
- Cắt nhanh theo "Quyển" (dùng danh sách quyển đã có trên web truyện).
- Xuất thêm `.txt`/`.docx`.
- Cắt nhiều đoạn cùng lúc (ví dụ 1–100, 101–200) thành nhiều file.
