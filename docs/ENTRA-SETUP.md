# Đăng ký Entra app (một lần, ~10 phút)

Để dashboard đọc được SharePoint, cần đăng ký 1 "App registration" trên Microsoft Entra của công ty. Ai làm được: người có quyền tạo app registration (thường IT admin; hoặc bất kỳ ai nếu tenant cho phép user tự đăng ký app).


## Các bước

1. Mở **https://entra.microsoft.com** → **Identity → Applications → App registrations → New registration**.
2. Điền:
   - **Name:** `TA Performance Dashboard`
   - **Supported account types:** *Accounts in this organizational directory only (Eastgate Software only - Single tenant)*
   - **Redirect URI:** chọn platform **Single-page application (SPA)**, URI: `http://localhost:8763` (để test local)
   - Bấm **Register**.
3. Vào **Authentication → Single-page application → Add URI** và thêm URL thật của site:
   `https://hykmnn.github.io/ta-performance-dashboard/`
4. **API permissions → Add a permission → SharePoint → Delegated permissions** → tick **AllSites.Read** VÀ **AllSites.Write** (Write cần cho tính năng Log data trên platform) → **Add permissions**.
5. Nếu cột Status hiện "Not granted": bấm **Grant admin consent for Eastgate Software** (cần IT admin bấm — chỉ 1 lần). Nếu tenant cho phép user consent thì bỏ qua, người dùng đầu tiên đăng nhập sẽ tự bấm Accept.
6. Vào **Overview**, copy 2 giá trị:
   - **Application (client) ID**
   - **Directory (tenant) ID**
7. Mở file `js/config.js` trong repo, thay:
   ```js
   clientId: "<Application (client) ID>",
   tenantId: "<Directory (tenant) ID>",
   ```
   Commit + push → dashboard tự chuyển từ DEMO sang data thật.

## Kiểm tra

- Mở dashboard → thấy màn hình "Sign in with Microsoft" (không còn banner DEMO).
- Đăng nhập bằng tài khoản có quyền vào site ORG HR Admin → số liệu khớp với list "Recruitment Funnel Weekly" (view All Items).
- Đăng nhập bằng tài khoản KHÔNG có quyền vào site → hiện thông báo liên hệ HR (đúng thiết kế).

## Lưu ý bảo mật

- App chỉ xin quyền **đọc** (AllSites.Read, delegated) — đọc dưới danh nghĩa người đăng nhập, không đọc được gì mà bản thân người đó không mở được.
- Không có client secret nào trong code (SPA + PKCE) — repo public cũng không lộ gì ngoài tên site/list.
