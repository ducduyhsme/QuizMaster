# QuizMaster

Một ứng dụng web mạnh mẽ giúp bạn tạo và chơi các bài quiz điền từ vựng, hỗ trợ đa ngôn ngữ, nhập dữ liệu từ Excel, và giao diện Dark Theme hiện đại.

## Yêu cầu hệ thống

- [Node.js](https://nodejs.org/) (phiên bản 14.x trở lên)

## Hướng dẫn cài đặt và chạy ứng dụng

### Bước 1: Cài đặt Node.js
Nếu máy tính của bạn chưa có Node.js, hãy tải và cài đặt từ trang chủ: [https://nodejs.org/](https://nodejs.org/)

### Bước 2: Mở thư mục mã nguồn
Mở terminal (Command Prompt, PowerShell, hoặc Terminal trong VS Code) tại thư mục chứa dự án.

### Bước 3: Cài đặt thư viện (Dependencies)
Chạy lệnh sau để cài đặt các thư viện cần thiết:

```bash
npm install
```

### Bước 4: Khởi động Server
Sau khi cài đặt xong thư viện, khởi động server bằng lệnh:

```bash
npm start
```
*(hoặc có thể dùng lệnh `node server.js`)*

### Bước 5: Truy cập ứng dụng

Sau khi server chạy thành công, trên màn hình terminal sẽ hiển thị thông báo:
```text
🚀 Quiz App is running!
   Local:    http://localhost:3000
   Network:  http://0.0.0.0:3000
```

1. **Truy cập trên máy tính của bạn (Local):**
   Mở trình duyệt web (Chrome, Edge, Firefox, Safari...) và truy cập đường dẫn:
   [http://localhost:3000](http://localhost:3000)

2. **Truy cập qua mạng Lan (Các thiết bị dùng chung mạng Wi-Fi):**
   Người dùng khác (hoặc bạn dùng điện thoại) có thể truy cập bằng địa chỉ IP của máy tính đang chạy server. Ví dụ:
   `http://192.168.1.X:3000` (Trong đó `192.168.1.X` là địa chỉ IPv4 của máy bạn).

3. **Truy cập qua Internet (Chia sẻ cho bạn bè ở xa):**
   Để chia sẻ ứng dụng này ra ngoài Internet cho bạn bè ở nơi khác có thể vào được, bạn cần dùng các công cụ tunneling như **Ngrok** hoặc **Cloudflare Tunnel**.

   **Cách dùng Ngrok nhanh:**
   - Tải ứng dụng [Ngrok](https://ngrok.com/).
   - Mở một cửa sổ terminal mới và gõ lệnh:
     ```bash
     ngrok http 3000
     ```
   - Ngrok sẽ tạo ra một đường dẫn public dạng `https://<random-id>.ngrok.app`. Bạn chỉ cần copy đường dẫn này gửi cho mọi người là xong! Mọi người truy cập vào link đó rồi nhập mã Quiz 6 chữ số để chơi.

   **Cách dùng Cloudflare Tunnel (Miễn phí, ổn định, không giới hạn thời gian):**
   - Tải file `cloudflared` về máy tính từ [Cloudflare Downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
   - Mở terminal (ví dụ: ở thư mục chứa file vừa tải) và chạy lệnh sau (hoàn toàn không cần tạo tài khoản):
     ```bash
     cloudflared tunnel --url http://localhost:3000
     ```
   - Chờ một lát, trong bảng log xuất ra ở terminal sẽ có một dòng chứa link public dạng `https://<các-từ-ngẫu-nhiên>.trycloudflare.com`.
   - Copy đường link này và gửi cho bạn bè để truy cập trực tiếp vào ứng dụng của bạn!

## Các tính năng chính của QuizMaster

- **Quản lý Quiz**: Tạo mới, chỉnh sửa, xóa bộ câu hỏi.
- **Import từ Excel**: Dễ dàng nhập hàng loạt câu hỏi và đáp án từ file Excel (`.xlsx`, `.csv`).
- **Mã Quiz**: Tự động sinh mã 6 chữ số dễ nhớ, giúp chia sẻ bài quiz nhanh chóng.
- **Hỗ trợ Media**: Thêm hình ảnh và âm thanh vào từng câu hỏi để bài quiz thêm trực quan và sinh động.
- **Thống kê chi tiết**: Bảng tổng kết kết quả (số câu đúng/sai, tỷ lệ % hoàn thành, xem lại các đáp án làm sai).
- **Tuỳ chỉnh (Settings)**: Có thể bật/tắt đảo ngẫu nhiên vị trí câu hỏi, hoán đổi Câu hỏi & Đáp án (Swap Q↔A).
- **Đa ngôn ngữ**: Chuyển đổi nhanh chóng giữa Tiếng Việt và Tiếng Anh.

---
Chúc bạn sử dụng QuizMaster thật hiệu quả nhé! 🚀
