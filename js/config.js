// Cấu hình kết nối. Điền clientId/tenantId sau khi đăng ký Entra app
// (xem docs/ENTRA-SETUP.md). Khi còn giá trị placeholder → chạy DEMO mode.
export const CONFIG = {
  clientId: "YOUR_CLIENT_ID",
  tenantId: "YOUR_TENANT_ID",
  siteHost: "eastgatesoftware.sharepoint.com",
  sitePath: "/sites/ORGHRAdmin",
  funnelList: "Recruitment Funnel Weekly",
  kpiList: "TA KPI Achievements",
  isDemo() {
    return this.clientId === "YOUR_CLIENT_ID";
  },
};
