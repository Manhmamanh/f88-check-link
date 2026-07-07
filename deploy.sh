#!/bin/bash
# Deploy app "Check Link Ghi Nhận" lên một Firebase Hosting site RIÊNG (không đụng site/dự án khác).
# Cách dùng:  ./deploy.sh <PROJECT_ID> [SITE_ID]
# Ví dụ:      ./deploy.sh my-firebase-project check-link-f88
set -euo pipefail

PROJECT_ID="${1:?Thiếu PROJECT_ID. Chạy: ./deploy.sh <PROJECT_ID> [SITE_ID]. Xem danh sách: firebase projects:list}"
SITE_ID="${2:-check-link-f88}"

cd "$(dirname "$0")"

echo "==> Build production..."
npm run build

echo "==> Tạo Hosting site riêng (bỏ qua nếu đã tồn tại): $SITE_ID"
firebase hosting:sites:create "$SITE_ID" --project "$PROJECT_ID" || true

echo "==> Gán deploy target 'linkcheck' -> $SITE_ID"
firebase target:apply hosting linkcheck "$SITE_ID" --project "$PROJECT_ID"

echo "==> Deploy CHỈ target linkcheck (không ảnh hưởng site khác)..."
firebase deploy --only hosting:linkcheck --project "$PROJECT_ID"

echo ""
echo "✅ Xong! App chạy tại: https://$SITE_ID.web.app"
