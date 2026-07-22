// Cấu hình kết nối. Điền clientId/tenantId sau khi đăng ký Entra app
// (xem docs/ENTRA-SETUP.md). Khi còn giá trị placeholder → chạy DEMO mode.
export const CONFIG = {
  clientId: "acd70ab1-98df-4f7f-97bd-f32f2149c59c",
  tenantId: "1fd983f3-dc44-42f8-ad66-7972e9d94659",
  siteHost: "eastgatesoftware.sharepoint.com",
  sitePath: "/sites/ORGHRAdmin",
  funnelList: "Recruitment Funnel Weekly",
  kpiList: "TA KPI Achievements",
  // Dòng data của những người này bị loại khỏi mọi thống kê (data test,
  // không phải nhân sự TA).
  excludeRecruiters: ["Hong Bui"],
  // Target phỏng vấn mỗi tuần cho 1 vị trí đang tuyển (section Open Positions).
  interviewWeeklyTarget: 5,
  // Email được thấy màn Admin (xem/xóa mọi entry).
  admins: ["hong.bui@eastgate-software.com"],
  // 14 vị trí — khớp choice của cột Position trong list.
  positions: ["Java", "Frontend Web", "Backend Web", "AI", "DevOps", "BA", "QA",
    "PM", "UI/UX", "GET", "KAM", "MKT", "HR", "Comtor"],
  isDemo() {
    return this.clientId === "YOUR_CLIENT_ID";
  },
};
