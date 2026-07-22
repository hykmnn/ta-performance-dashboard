# Deploy lên GitHub Pages (~5 phút)

## 1. Tạo repo

Tạo repo trên GitHub (org công ty hoặc tài khoản cá nhân):

```bash
cd ~/Desktop/ta-performance-dashboard
gh repo create egs-people-operations/ta-performance-dashboard --public --source . --push
# hoặc: gh repo create <your-username>/ta-performance-dashboard --public --source . --push
```

(Không có `gh` CLI thì tạo repo trống trên github.com rồi `git remote add origin … && git push -u origin main`.)

## 2. Bật GitHub Pages

Trên GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**

Sau ~1 phút, site sẵn sàng tại:
`https://<org-hoặc-user>.github.io/ta-performance-dashboard/`

Khi chưa cấu hình Entra app, site chạy DEMO DATA — chia sẻ được ngay cho team xem giao diện.

## 3. Nối data thật

1. Làm theo **ENTRA-SETUP.md** (đăng ký app, lấy clientId/tenantId).
2. Thêm URL Pages ở trên vào **Redirect URI (SPA)** của app.
3. Điền clientId/tenantId vào `js/config.js`, commit + push.

## Cập nhật sau này

Sửa code → commit → push. Pages tự deploy lại sau ~1 phút.
