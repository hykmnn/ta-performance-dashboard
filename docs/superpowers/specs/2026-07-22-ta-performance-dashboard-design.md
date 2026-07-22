# TA Performance Dashboard — Design Spec

**Ngày:** 2026-07-22 · **Người duyệt:** Hong Bui (đã duyệt qua chat)

## Mục đích

Platform hiển thị performance của team Talent Acquisition tại Eastgate Software, tương tự platform core-value-recognition của công ty (https://egs-people-operations.github.io/core-value-recognition/). Dashboard-only (không có tính năng vote/recognition), đọc data real-time từ SharePoint, kèm benchmark theo bảng KPI bonus tuyển dụng.

## Kiến trúc

```
Recruiters nhập ──▶ SharePoint Lists (site ORGHRAdmin)
                        │  SharePoint REST API (đọc, delegated)
                        ▼
GitHub Pages (static SPA) ── MSAL.js sign-in ──▶ Dashboard
```

- **Static site 1 trang** (index.html tự chứa, không build step) host trên GitHub Pages.
- **Đăng nhập Microsoft (MSAL.js, PKCE)** bằng tài khoản Eastgate. Site gọi SharePoint REST API (`_api/web/lists`) đọc list items — chọn REST thay Graph vì `$expand=Author/Recruiter` resolve được tên người trong 1 request. Phân quyền kế thừa site ORGHRAdmin: ai không có quyền vào site thì REST trả 403 → không xem được data.
- **Entra app registration** (một lần): SPA, redirect URI = URL GitHub Pages + localhost để dev; delegated permission **SharePoint › AllSites.Read**.
- **Chế độ demo:** khi chưa cấu hình `clientId` (placeholder), site chạy với data mẫu nhúng sẵn để duyệt giao diện.

## Nguồn data

### List 1 (đã có, giữ nguyên): `Recruitment Funnel Weekly`

Site `https://eastgatesoftware.sharepoint.com/sites/ORGHRAdmin`. Cột thực tế (internal name): `WeekEnding` (Date, Chủ nhật), `Position` (Choice 14 vị trí), 6 cột số: `CandidatesContacted`, `CandidatesResponses`, `Applications`, `Interviews`, `Offers`, `Hires`, `Notes`. **Lưu ý:** list thật không có cột "Potential Candidate Identified" — đỉnh funnel là Candidates Contacted, nên "Total Intake" trên dashboard = Σ Contacted.

- **Recruiter = Created By** (`Author`) của từng dòng — mỗi recruiter tự nhập vị trí mình phụ trách.
- **Outcome Distribution tính gần đúng từ độ rơi funnel:**
  - Onboarded = `Hires`
  - Declined Offer = `Offers − Hires`
  - Failed Interview = `Interviews − Offers`
  - Failed CV (không qua vòng hồ sơ) = `Applications − Interviews`
  - Not Applied (phản hồi nhưng không nộp) = `Responses − Applications`
  - No Response = `Contacted − Responses`

### List 2 (tạo mới): `TA KPI Achievements`

Mỗi dòng = 1 thành tích KPI đã xác nhận (nhập vài lần/tháng bởi leader/recruiter):

| Cột (internal name) | Kiểu | Ghi chú |
|---|---|---|
| Candidate / Note (`Title`) | Text, optional | Tên ứng viên / ghi chú |
| Month (`KPIMonth`) | Date, required | Chọn ngày 01 của tháng ghi nhận |
| Recruiter (`Recruiter`) | Person, required | Recruiter được ghi nhận |
| KPI Type (`KPIType`) | Choice, required | 7 lựa chọn, xem bảng dưới |

*Đã tạo thật trên site ORGHRAdmin ngày 2026-07-22 (verify: thêm/xóa item OK).*

**KPI Type + bonus (VND, hard-code trong dashboard):**

| Choice value | Bonus |
|---|---|
| TL S1/S2 pass probation | 5,000,000 |
| IT S1/S2 pass probation | 3,000,000 |
| IT M1/M2 pass probation | 2,000,000 |
| IT J1/J2 pass probation | 1,000,000 |
| IT M/S service contract cycle | 500,000 |
| Time-to-fill ≤ 30 days | 500,000 |
| Non-IT pass probation | 500,000 |

**KPI tự tính từ List 1 (theo recruiter × tháng):**

| KPI | Target/tháng | Bonus | Quy tắc |
|---|---|---|---|
| Interviews | 40 | 1,000,000 | Σ `Interviews` trong tháng; < 40 → bonus 0 |
| Ready to Offer | 8 | 1,000,000 | Σ `Offers` trong tháng; < 8 → bonus 0 |
| Top-up | cả 2 target | 500,000 | Đạt đồng thời 40 interviews VÀ 8 RTO cùng tháng |

## Dashboard UI (tông đỏ/trắng như ảnh mẫu)

1. **Header:** logo/tiêu đề "TA PERFORMANCE STATS", bộ lọc thời gian (All Time / 30 Days / 7 Days / chọn tháng), lọc recruiter, nút refresh.
2. **Hàng 6 KPI cards — đúng 6 chỉ số của list funnel:** Candidates Contacted, Candidates Responses, Applications, Interviews, Offers, Hires; badge trên mỗi thẻ = tỷ lệ chuyển đổi so với bậc liền trước.
3. **Top Performer card (đỏ):** recruiter nhiều offers nhất theo filter hiện tại.
4. **TA Team Leaderboard:** rank theo Offers; cột Candidates Intake, Offers Made, Success Rate (Offers/Applications).
5. **Outcome Distribution:** thanh ngang theo 6 outcome ở trên.
6. **KPI Benchmark theo tháng (mới):** chọn tháng; mỗi recruiter 1 hàng: progress bar Interviews x/40, RTO x/8, badge Top-up, chips KPI achievements trong tháng, **tổng bonus ước tính (VND)**.

## Xử lý lỗi

- Chưa đăng nhập → landing "Sign in with Microsoft" (giống platform mẫu).
- Graph 403 → "Bạn chưa có quyền vào site ORGHRAdmin — liên hệ HR."
- Token hết hạn → silent refresh qua MSAL, fallback popup.
- List trống / tháng không data → hiển thị 0, layout không vỡ.
- `clientId` chưa cấu hình → banner "DEMO DATA" + data mẫu.

## Ngoài phạm vi (YAGNI)

- Không có tính năng recognition/vote/badge.
- Không ghi data từ platform (List 2 nhập trực tiếp trên SharePoint/Teams).
- Không lịch sử bonus đã chi trả, không export.

## Lộ trình

1. Build dashboard chạy demo data → user duyệt giao diện.
2. Tạo list `TA KPI Achievements` trên SharePoint.
3. Hướng dẫn đăng ký Entra app (file ENTRA-SETUP.md) — cần IT admin consent.
4. Nối data thật, deploy GitHub Pages (file DEPLOY.md).

## Kiểm thử

- Demo mode: mở index.html local, kiểm tra mọi section render đúng với data mẫu (kể cả tháng trống, recruiter 0 offers).
- Tính đúng: unit-check các công thức aggregate bằng data mẫu biết trước kết quả.
- Live mode: sau khi có Entra app — đăng nhập, so số dashboard với view All Items của list.
