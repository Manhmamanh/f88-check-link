# ✅ F88 Check Link Ghi Nhận

Web app kiểm tra link bài đăng từ Google Sheet — tự động check định dạng, phát hiện công khai, tìm hashtag @f88taichinhbinhdan.

## Tính năng

- 📊 **Tải dữ liệu từ Google Sheet** — tự động đọc cột I (link ghi nhận)
- ⚡ **Check tự động** — phát hiện link sai, tên miền lạ, duplicate
- 🔍 **Review nhanh** — phím tắt 1–4 để chấm từng link (5-10 phút/500 link)
- 📥 **Import kết quả** — load file JSON với kết quả check từ Google Apps Script hoặc CLI
- 📋 **Copy/Export** — copy cột J+K hoặc tải CSV
- 💾 **Lưu tự động** — kết quả được save trên trình duyệt
- 🎯 **Filter chi tiết** — lọc riêng Link sai, Không công khai, Thiếu/sai hashtag

## Kết quả kiểm tra (502 link)

| Loại | Số lượng |
|---|---|
| ✅ Hợp lệ | 181 |
| ❌ Không công khai | 58 |
| ⚠️ Thiếu/sai hashtag | 146 |
| 🚫 Link sai | 12 |
| ? Chưa kết luận | 105 |

## Cách dùng

### 1. Chạy web app
```bash
npm install
npm run dev
# Mở http://localhost:5183
```

### 2. Import kết quả
Bấm "📥 Import kết quả" → chọn `check-results-final.json`

### 3. Lọc & xem chi tiết
- Bấm "Tất cả" → "Chi tiết lỗi" → chọn loại (Link sai, Không công khai, v.v.)
- Hoặc "Chưa check" để review tay bằng "▶ Review nhanh"

### 4. Dán vào Sheet
Bấm "📋 Copy cột J+K" → mở Sheet, click J2 → dán

## Google Apps Script (tự động check)

File: `apps-script-check-link.gs`

Cài: Google Sheet → Tiện ích mở rộng → Apps Script → dán code → chạy "chayCheckTuDong"

Tự check: link sai, không công khai, hợp lệ, thiếu hashtag

## Deployment lên Firebase

```bash
firebase login
cd link-check-f88
./deploy.sh <PROJECT_ID>
```

Hoặc: `firebase hosting:sites:create <SITE_ID>` → deploy thủ công

---

**Build time:** ~2 giờ check 502 link  
**Last updated:** 2026-07-08
