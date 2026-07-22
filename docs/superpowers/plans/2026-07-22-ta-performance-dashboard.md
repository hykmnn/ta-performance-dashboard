# TA Performance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Static GitHub-Pages dashboard đọc 2 SharePoint list (funnel weekly + KPI achievements) qua Microsoft Graph, hiển thị performance & KPI bonus của team TA.

**Architecture:** Site tĩnh không build-step: `index.html` (layout + style) + các file JS thuần. Logic tính toán tách vào `js/metrics.js` (pure functions, test được bằng `node --test`). Data layer có 2 nguồn hoán đổi: `js/data-demo.js` (demo mode khi chưa có clientId) và `js/graph.js` (MSAL + Graph live mode).

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), MSAL.js 3.x qua CDN (chỉ live mode), `node --test` cho unit tests.

## Global Constraints

- Không build step, không npm dependency runtime — mở `index.html` là chạy.
- Toàn bộ chữ trên UI: tiếng Anh (như platform mẫu); tông màu đỏ `#C8102E`/trắng/xám như ảnh mẫu.
- Demo mode khi `CONFIG.clientId === "YOUR_CLIENT_ID"` → dùng data mẫu + banner "DEMO DATA".
- Funnel columns thứ tự: Potential Candidate Identified ≥ Candidates Contacted ≥ Candidates Responses ≥ Applications ≥ Interviews ≥ Offers ≥ Hires.
- Bonus VND hard-code đúng spec: 5tr/3tr/2tr/1tr/500k/500k/500k; Interviews 40→1tr (<40→0); RTO 8→1tr (<8→0); Top-up 500k.

---

### Task 1: Metrics engine (pure functions) + tests

**Files:**
- Create: `js/metrics.js`
- Test: `test/metrics.test.mjs`

**Interfaces:**
- Produces (ES module exports, mỗi hàm nhận `rows` = mảng item funnel `{weekEnding: "YYYY-MM-DD", position, recruiter, potential, contacted, responses, applications, interviews, offers, hires}` và `achievements` = mảng `{month: "YYYY-MM", recruiter, kpiType, title}`):
  - `filterRows(rows, {fromDate, toDate, recruiter})` → rows
  - `totals(rows)` → `{potential, contacted, responses, applications, interviews, offers, hires}`
  - `rates(t)` → `{cvPass, selected, interviewed, offerSuccess}` (percent, 1 chữ số thập phân; chia 0 → 0)
  - `outcomeDistribution(t)` → mảng 6 `{key, label, count, pct}`: onboarded, declinedOffer, failedInterview, failedCV, notApplied, noResponse
  - `leaderboard(rows)` → mảng desc theo offers: `{recruiter, intake, offers, successRate}` (successRate = offers/applications %)
  - `monthlyKpi(rows, achievements, "YYYY-MM")` → mảng theo recruiter: `{recruiter, interviews, rto, interviewsBonus, rtoBonus, topupBonus, achievements: [...], achievementsBonus, totalBonus}`
  - `KPI_BONUS` — map 7 kpiType → VND
- Consumes: không phụ thuộc task khác.

- [x] **Step 1:** Viết `test/metrics.test.mjs` với dataset cố định biết trước kết quả — case: tổng hợp đúng, chia 0, filter theo ngày/recruiter, outcome đủ 6 nhóm cộng lại = potential, leaderboard sort, KPI đạt/không đạt target, top-up chỉ khi đạt cả 2.
- [x] **Step 2:** Chạy `node --test test/` — FAIL (module chưa có).
- [x] **Step 3:** Viết `js/metrics.js` tối thiểu cho pass.
- [x] **Step 4:** `node --test test/` — PASS toàn bộ.
- [x] **Step 5:** Commit `feat: metrics engine + tests`.

### Task 2: Demo data + config

**Files:**
- Create: `js/data-demo.js`, `js/config.js`

**Interfaces:**
- Produces: `DEMO_FUNNEL` (~26 tuần × 5 recruiter AnhTD/MyLTP/LyPK/DucPM/VietBN × vài position, số hợp lệ theo thứ tự funnel, tổng cỡ ảnh mẫu ~193 intake gần đây), `DEMO_ACHIEVEMENTS` (vài dòng 2-3 tháng gần nhất), `CONFIG = {clientId: "YOUR_CLIENT_ID", tenantId: "YOUR_TENANT_ID", siteHost: "eastgatesoftware.sharepoint.com", sitePath: "/sites/ORGHRAdmin", funnelList: "Recruitment Funnel Weekly", kpiList: "TA KPI Achievements", isDemo()}`.

- [x] **Step 1:** Viết 2 file; demo data sinh bằng vòng lặp deterministic (seed cố định, không Math.random) để số ổn định.
- [x] **Step 2:** Sanity: `node -e "import('./js/data-demo.js').then(m=>console.log(m.DEMO_FUNNEL.length))"` chạy không lỗi, mọi dòng thỏa bất đẳng thức funnel (assert trong script kiểm tra nhanh).
- [x] **Step 3:** Commit `feat: demo data + config`.

### Task 3: Dashboard UI (index.html + app.js + styles.css)

**Files:**
- Create: `index.html`, `css/styles.css`, `js/app.js`

**Interfaces:**
- Consumes: mọi export của Task 1, 2.
- Produces: `renderAll(rows, achievements)` — render 6 khối: header+filters, 5 KPI cards, Top Performer, Leaderboard, Outcome Distribution, KPI Benchmark (month picker riêng, default tháng hiện tại theo data).

Yêu cầu cụ thể từng khối (theo spec §Dashboard UI): time filter All Time/30 Days/7 Days tính từ max weekEnding trong data; recruiter dropdown build từ data; KPI cards: Total Intake=potential, Qualified=responses (+cvPass% "CV Pass Rate"), Selected=applications (+% of qualified), Interviewed=interviews (+% interview ratio), Offers Made=offers (+offerSuccess% "Offer Success"); Top Performer = leaderboard[0] khi sort offers; leaderboard table 5 cột như ảnh (rank, recruiter, intake, offers badge đỏ, success rate); outcome 6 thanh ngang; KPI benchmark: mỗi recruiter card ngang — progress Interviews x/40, RTO x/8, badge TOP-UP, chips achievements, tổng bonus format `5,500,000 ₫`; demo banner khi `CONFIG.isDemo()`.

- [x] **Step 1:** Viết `index.html` skeleton + `css/styles.css` (CSS variables, cards, table, progress bars, responsive ≥360px).
- [x] **Step 2:** Viết `js/app.js`: state {timeFilter, recruiter, kpiMonth} → gọi metrics → render DOM; gắn event listeners.
- [x] **Step 3:** Mở qua preview browser, kiểm tra: các section hiện đúng, filter đổi số, tháng trống hiện 0, console không lỗi.
- [x] **Step 4:** Screenshot cho user duyệt. Commit `feat: dashboard UI with demo mode`.

### Task 4: Live mode — MSAL + Graph

**Files:**
- Create: `js/graph.js`
- Modify: `js/app.js` (bootstrap: demo vs live), `index.html` (landing sign-in view)

**Interfaces:**
- Consumes: `CONFIG`.
- Produces: `signIn()`, `getData()` → `{rows, achievements}` — map Graph list items về đúng shape Task 1; lỗi 403 → throw `PermissionError` để app hiện hướng dẫn xin quyền; recruiter lấy từ `fields.Author` (expand) hoặc `createdBy.user.displayName`.

Graph calls: `GET /sites/{host}:{path}` → siteId; `GET /sites/{id}/lists/{name}/items?expand=fields&$top=...` (phân trang @odata.nextLink). Scope: `Sites.Read.All` + `User.Read`. MSAL: loginPopup → acquireTokenSilent fallback popup.

- [x] **Step 1:** Viết `js/graph.js` + landing view (logo, mô tả, nút "Sign in with Microsoft") chỉ hiện ở live mode; demo mode vào thẳng dashboard.
- [x] **Step 2:** Không thể test live khi chưa có Entra app — kiểm tra tĩnh: `node --check` từng file; mở demo mode xác nhận không regression.
- [x] **Step 3:** Commit `feat: live mode via MSAL + Microsoft Graph`.

### Task 5: Tạo list "TA KPI Achievements" trên SharePoint

**Files:** không (thao tác trên SharePoint qua browser đã đăng nhập; fallback: viết hướng dẫn tay vào `docs/SHAREPOINT-KPI-LIST.md`).

- [x] **Step 1:** Qua Chrome (tab eastgatesoftware.sharepoint.com đã đăng nhập), dùng SharePoint REST từ page context tạo list + 4 cột theo spec (Title, Month Date, Recruiter Person, KPI Type Choice 7 giá trị, require).
- [x] **Step 2:** Verify: mở list trên UI, thấy đủ cột + choice values; thêm 1 dòng thử rồi xóa.
- [x] **Step 3:** Ghi kết quả (URL list) vào `README.md`. Nếu browser không truy cập được → viết `docs/SHAREPOINT-KPI-LIST.md` hướng dẫn từng bước và báo user.

### Task 6: Tài liệu setup & deploy

**Files:**
- Create: `README.md`, `docs/ENTRA-SETUP.md`, `docs/DEPLOY.md`

- [x] **Step 1:** `ENTRA-SETUP.md`: đăng ký app (SPA, redirect URIs gồm GitHub Pages URL + http://localhost:8000), permission Sites.Read.All delegated, admin consent, lấy clientId/tenantId điền vào `js/config.js`.
- [x] **Step 2:** `DEPLOY.md`: tạo repo (org egs-people-operations hoặc cá nhân), push, bật Pages, cập nhật redirect URI.
- [x] **Step 3:** `README.md`: mô tả, cấu trúc, demo vs live, cách chạy test.
- [x] **Step 4:** Commit `docs: setup and deploy guides`. Chạy lại `node --test test/` lần cuối — PASS.
