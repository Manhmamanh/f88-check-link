/**
 * F88 — Check Link Ghi Nhận tự động (Google Apps Script)
 *
 * CÁCH CÀI:
 *  1. Mở Google Sheet → menu "Tiện ích mở rộng" (Extensions) → "Apps Script".
 *  2. Xoá code mẫu, dán toàn bộ file này → bấm Lưu (💾).
 *  3. Quay lại Sheet, tải lại trang → xuất hiện menu "✅ F88 Check Link".
 *  4. Bấm "Chạy check tự động". Lần đầu Google hỏi cấp quyền → Cho phép.
 *
 * QUY TẮC (đã kiểm chứng với dữ liệu thật của sheet):
 *  - CHỈ điền vào dòng cột J đang TRỐNG — không ghi đè kết quả đã có.
 *  - "Link sai"        : trống, không phải URL, tên miền lạ, trang 404.
 *  - "Không công khai" : Facebook không trả thông tin bài viết (bài riêng tư).
 *  - "Hợp lệ"          : bài công khai VÀ thấy hashtag f88taichinhbinhdan.
 *  - "Thiếu/sai hashtag": bài công khai, đọc được TOÀN BỘ nội dung tóm tắt
 *                         mà không có hashtag.
 *  - Để trống          : không kết luận chắc chắn được (vd: bài dài bị cắt
 *                         nội dung, TikTok/LinkedIn chặn máy đọc) → check tay
 *                         bằng web app "Review nhanh".
 *  - Sheet dài quá 1 lượt chạy (giới hạn 6 phút) → tự đặt lịch chạy tiếp sau 1 phút.
 */

const HASHTAG = 'f88taichinhbinhdan'; // so khớp không phân biệt hoa thường, cả dạng # lẫn @
const COL_I = 9;  // Link ghi nhận
const COL_J = 10; // Check link ghi nhận
const COL_K = 11; // Tổng
const ROW_START = 2;
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // dừng trước giới hạn 6 phút của Apps Script
const DESC_TRUNCATED_LEN = 190; // og:description dài cỡ này nghĩa là đã bị Facebook cắt bớt

const SOCIAL_DOMAINS = [
  /(^|\.)facebook\.com$/i, /(^|\.)fb\.com$/i, /(^|\.)fb\.watch$/i,
  /(^|\.)linkedin\.com$/i, /^lnkd\.in$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)threads\.(net|com)$/i,
  /(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i,
  /^x\.com$/i, /(^|\.)twitter\.com$/i,
  /(^|\.)zalo\.me$/i,
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('✅ F88 Check Link')
    .addItem('Chạy check tự động', 'chayCheckTuDong')
    .addItem('Dừng lịch chạy tiếp', 'xoaLichChayTiep')
    .addToUi();
}

function chayCheckTuDong() {
  const t0 = Date.now();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow < ROW_START) return;

  const n = lastRow - ROW_START + 1;
  const links = sheet.getRange(ROW_START, COL_I, n, 1).getValues();
  const js = sheet.getRange(ROW_START, COL_J, n, 1).getValues();
  const ks = sheet.getRange(ROW_START, COL_K, n, 1).getValues();

  let daDien = 0;
  let hetGio = false;

  for (let i = 0; i < n; i++) {
    if (Date.now() - t0 > TIME_BUDGET_MS) { hetGio = true; break; }

    const link = String(links[i][0] || '').trim();
    const jHienTai = String(js[i][0] || '').trim();
    if (!link || jHienTai) continue; // bỏ qua dòng trống hoặc đã có kết quả

    const kq = checkMotLink(link);
    if (!kq) continue; // không kết luận được → để trống cho check tay

    js[i][0] = kq;
    ks[i][0] = kq === 'Hợp lệ' ? 'Hợp lệ' : 'Không hợp lệ';
    daDien++;

    // ghi dần mỗi 20 dòng để không mất kết quả nếu bị ngắt giữa chừng
    if (daDien % 20 === 0) {
      sheet.getRange(ROW_START, COL_J, n, 1).setValues(js);
      sheet.getRange(ROW_START, COL_K, n, 1).setValues(ks);
    }
    Utilities.sleep(300); // giãn nhịp, tránh bị Facebook chặn
  }

  sheet.getRange(ROW_START, COL_J, n, 1).setValues(js);
  sheet.getRange(ROW_START, COL_K, n, 1).setValues(ks);

  if (hetGio) {
    datLichChayTiep();
    thongBao('Đã điền thêm ' + daDien + ' dòng. Chưa xong — tự chạy tiếp sau 1 phút.');
  } else {
    xoaLichChayTiep();
    thongBao('Xong! Đã tự điền ' + daDien + ' dòng. Dòng J còn trống → check tay bằng web app (Review nhanh).');
  }
}

/** Trả về 'Link sai' | 'Không công khai' | 'Hợp lệ' | 'Thiếu/sai hashtag' | '' (không kết luận) */
function checkMotLink(link) {
  // 1) Kiểm tra định dạng và tên miền
  const m = link.match(/^https?:\/\/([^\/?#]+)/i);
  if (!m) return 'Link sai';
  const host = m[1].toLowerCase().replace(/^www\.|^m\.|^web\.|^vt\.|^vm\.|^l\./, '');
  if (!SOCIAL_DOMAINS.some(function (re) { return re.test(host); })) return 'Link sai';

  const laFacebook = /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.watch$/i.test(host);

  // 2) Truy cập link với User-Agent crawler — Facebook trả thông tin og-meta
  //    cho bài công khai và trang rỗng cho bài riêng tư (đã kiểm chứng)
  let html = '';
  let code = 0;
  try {
    const res = UrlFetchApp.fetch(link, {
      followRedirects: true,
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept-Language': 'vi,en;q=0.8',
      },
    });
    code = res.getResponseCode();
    html = res.getContentText() || '';
  } catch (e) {
    return ''; // lỗi mạng → không kết luận
  }

  if (code === 404 || code === 410) return 'Link sai';
  if (code >= 400) return ''; // 403/429... không kết luận để tránh oan sai

  const htmlLower = html.toLowerCase();

  // Hashtag xuất hiện ở bất kỳ đâu trong trang → chắc chắn hợp lệ
  if (htmlLower.indexOf(HASHTAG) >= 0) return 'Hợp lệ';

  const ogDesc = layOgMeta(html, 'og:description');
  const ogTitle = layOgMeta(html, 'og:title');

  if (laFacebook) {
    // Bài riêng tư: Facebook trả trang không có og:title lẫn og:description
    if (ogTitle === null && ogDesc === null) return 'Không công khai';
    if (ogDesc !== null) {
      if (ogDesc.length >= DESC_TRUNCATED_LEN) return ''; // nội dung bị cắt → check tay
      return 'Thiếu/sai hashtag'; // đọc được toàn bộ tóm tắt, không có hashtag
    }
    return ''; // có og:title nhưng không có mô tả (ảnh/video...) → check tay
  }

  // Nền tảng khác (TikTok, LinkedIn, Instagram, Threads...): chỉ kết luận khi
  // thấy hashtag (đã xử lý ở trên); còn lại để check tay vì các trang này
  // thường chặn máy đọc nội dung.
  return '';
}

/** Lấy nội dung một thẻ og-meta, đã giải mã HTML entities. Trả null nếu không có. */
function layOgMeta(html, property) {
  const re = new RegExp('<meta[^>]+property="' + property + '"[^>]+content="([^"]*)"', 'i');
  const m = html.match(re);
  if (!m) return null;
  return m[1]
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .trim();
}

function datLichChayTiep() {
  xoaLichChayTiep();
  ScriptApp.newTrigger('chayCheckTuDong').timeBased().after(60 * 1000).create();
}

function xoaLichChayTiep() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'chayCheckTuDong') ScriptApp.deleteTrigger(t);
  });
}

function thongBao(msg) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'F88 Check Link', 10);
  } catch (e) {
    Logger.log(msg);
  }
}
