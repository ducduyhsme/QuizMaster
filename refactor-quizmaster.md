# Kế Hoạch Refactor Chi Tiết: QuizMaster Codebase Restructuring

> **File**: `refactor-quizmaster.md`  
> **Ngày tạo**: 30/07/2026  
> **Cấp độ Refactor**: 🔴 **Architectural** (Tách monolith backend & frontend engine, chuẩn hóa module giao tiếp)

---

## 🔍 Phase 0: Phân Loại Scope & Mục Tiêu

Dự án QuizMaster hiện tại có 2 file **Monolith** lớn cần phân rã:
1. `server.js` (~1,244 dòng): Trộn lẫn Router, Middleware Auth, Upload File, Render Excel, Logic sinh từ vựng, TTS proxy.
2. `public/js/quiz-player.js` (~2,085 dòng): Trộn lẫn State management, LocalStorage, EventSource sync, Audio TTS, Game loop, MCQ/Fill validation, UI Rendering.

### Quy tắc Vàng (Golden Rule):
Refactor chỉ thay đổi **CẤU TRÚC (HOW)**, tuyệt đối **KHÔNG thay đổi HÀNH VI (WHAT)**. Mọi giao diện, API contract và dữ liệu chơi của người dùng phải được bảo toàn 100%.

---

## 🧪 Phase 1: Baseline & Kiểm Tra Hiện Trạng

### Danh sách kiểm tra cần vượt qua trước và sau refactor:
1. `node --check server.js` và tất cả các file Javascript mới không có lỗi cú pháp.
2. Chạy `npm start` khởi động server trên cổng 3000 thành công.
3. Kiểm thử đầy đủ 3 luồng chính:
   - Luồng Đăng nhập / Đăng ký / Đổi mật khẩu.
   - Luồng Tạo & Chơi bài Quiz Câu hỏi & Bài Quiz Từ vựng (MCQ & Điền từ).
   - Luồng Lưu & Khôi phục phiên chơi dở (Sessions) & Xuất file Excel.

---

## 🗺️ Phase 2: Ma Trận Phân Rã & Tách File

```
QuizMaster Root
├── server.js                        (Rút gọn chỉ còn ~80 dòng khởi tạo server)
├── services/                        [NEW]
│   └── vocabService.js              (Thuật toán sinh câu hỏi từ vựng & bóc tách từ)
├── routes/                          [NEW]
│   ├── auth.js                      (API /api/auth/*)
│   ├── quizzes.js                   (API /api/quizzes/*)
│   ├── questions.js                 (API /api/questions/*)
│   ├── sessions.js                  (API /api/sessions/*)
│   ├── community.js                 (API /api/community/*)
│   ├── import-export.js             (API /api/import/* & /api/export/*)
│   └── tts.js                       (API /api/tts Proxy)
└── public/js/
    ├── utils.js                     [NEW] (Gom helper dùng chung: getCurrentUserId, NFC normalize)
    ├── player-state.js              [NEW] (Quản lý State, Queue & Sync LocalStorage/Beacon)
    ├── player-audio.js              [NEW] (Quản lý Audio TTS & Web Audio Context)
    └── quiz-player.js               (Rút gọn chỉ giữ UI controller chính)
```

---

## 📐 Phase 3: Kế Hoạch Thực Thi Từng Bước (Atomic Steps)

### 📌 Bước 1: Tạo Module Helper Dùng Chung (`public/js/utils.js`)
- [ ] Tạo file `public/js/utils.js` gom các hàm lặp lại:
  - `getCurrentUserObj()`
  - `getCurrentUserId()`
  - `getProgressKeyPrefix()`
  - `normalizeText(str)`
- [ ] Thêm `<script src="/js/utils.js"></script>` vào `public/index.html`.
- [ ] Cập nhật `auth.js`, `sync.js`, `sessions-view.js`, `quiz-player.js` sử dụng helper chung.

### 📌 Bước 2: Phân Rã Backend Routers (`routes/` & `services/`)
- [ ] Tạo `services/vocabService.js`: Chuyển `generateQuestionsFromVocab()`, `extractCleanVocabFromQuestions()`, `ensureVocabQuizUpToDate()`.
- [ ] Tạo `routes/auth.js`: Các endpoint `/api/auth/*`.
- [ ] Tạo `routes/quizzes.js`: Các endpoint `/api/quizzes/*`.
- [ ] Tạo `routes/questions.js`: Các endpoint `/api/questions/*`.
- [ ] Tạo `routes/sessions.js`: Các endpoint `/api/sessions/*`.
- [ ] Tạo `routes/community.js`: Các endpoint `/api/community/*`.
- [ ] Tạo `routes/import-export.js`: Các endpoint `/api/import/*` và `/api/export/*`.
- [ ] Tạo `routes/tts.js`: Endpoint `/api/tts`.
- [ ] Cập nhật `server.js` để import và gắn (mount) các router trên.

### 📌 Bước 3: Phân Rã Engine Chơi Quiz (`public/js/quiz-player.js`)
- [ ] Tạo `public/js/player-state.js`: Quản lý danh sách câu hỏi, vị trí hiện tại, lưu/đọc progress từ `localStorage` và API background `/api/sessions/save`.
- [ ] Tạo `public/js/player-audio.js`: Quản lý TTS Baidu/Google fallback & Web Audio Gain node.
- [ ] Cập nhật `public/js/quiz-player.js`: Tải nhẹ hơn, chuyên trách render giao diện câu hỏi, thanh tiến trình, hộp danh sách câu và bảng kết quả.
- [ ] Cập nhật `public/index.html` tải thêm các script player con.

---

## ✅ Phase 4 & 5: Quy Trình Kiểm Thử & Xác Nhận Zero Regression

Sau khi hoàn tất mỗi Bước:
1. Chạy `node --check` kiểm tra toàn bộ file `.js`.
2. Khởi động server `npm start`.
3. Kiểm tra tính toàn vẹn của ứng dụng trên trình duyệt:
   - [ ] Đăng nhập / Đăng xuất tài khoản.
   - [ ] Mở và chơi bài Quiz thông thường & Quiz từ vựng.
   - [ ] Thử nghiệm phát âm TTS.
   - [ ] Thử nghiệm lưu và xóa phiên chơi dở.
   - [ ] Thử nghiệm Xuất/Nhập file Excel.

---

## 📝 Báo Cáo Kế Hoạch Hoàn Tất

Bản kế hoạch này đã sẵn sàng để thực thi. Để bắt đầu triển khai theo từng bước, bạn chỉ cần xác nhận hoặc chạy lệnh `/create`!
