# TA Performance Dashboard

**Live:** https://hykmnn.github.io/ta-performance-dashboard/ (repo: https://github.com/hykmnn/ta-performance-dashboard)

Dashboard hiển thị performance team Talent Acquisition — Eastgate Software. Đọc và ghi data real-time với SharePoint (site ORG HR Admin), giao diện theo Eastgate Design System.

## Tính năng

- **Funnel KPI cards:** Total Intake, Qualified, Selected, Interviewed, Offers Made + tỷ lệ chuyển đổi.
- **Top Performer + Team Leaderboard** theo recruiter (recruiter = người nhập dòng data — Created By).
- **Outcome Distribution** ước tính từ độ rơi funnel.
- **Monthly KPI Benchmark:** progress 40 interviews & 8 ready-to-offer, top-up, thành tích hire (probation/time-to-fill) và **tổng bonus ước tính** theo bảng KPI bonus tuyển dụng.
- Filter: All Time / 30 Days / 7 Days, theo recruiter, chọn tháng KPI.

## Nguồn data (SharePoint site ORGHRAdmin)

| List | Vai trò |
|---|---|
| [Recruitment Funnel Weekly](https://eastgatesoftware.sharepoint.com/sites/ORGHRAdmin/Lists/Recruitment%20Funnel%20Weekly/AllItems.aspx) | Số funnel hàng tuần (recruiter tự nhập — như quy trình hiện tại) |
| [TA KPI Achievements](https://eastgatesoftware.sharepoint.com/sites/ORGHRAdmin/Lists/TA%20KPI%20Achievements/AllItems.aspx) | Mỗi dòng = 1 thành tích KPI (hire pass probation, time-to-fill ≤30d…) — nhập vài lần/tháng |

## Chạy

- **Demo mode** (mặc định, chưa cấu hình): mở `index.html` qua một static server bất kỳ — hiển thị data mẫu + banner DEMO.
- **Live mode:** làm theo [docs/ENTRA-SETUP.md](docs/ENTRA-SETUP.md) rồi [docs/DEPLOY.md](docs/DEPLOY.md).

## Cấu trúc

```
index.html          # layout
css/styles.css
js/config.js        # clientId/tenantId + tên site/list
js/metrics.js       # engine tính toán (pure functions)
js/data-demo.js     # data mẫu (demo mode)
js/graph.js         # MSAL + SharePoint REST (live mode)
js/app.js           # render + filters
test/metrics.test.mjs
docs/               # spec, plan, hướng dẫn setup
```

## Test

```bash
node --test test/metrics.test.mjs
```
