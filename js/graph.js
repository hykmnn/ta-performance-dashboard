// Live mode: MSAL (đăng nhập Microsoft) + SharePoint REST đọc 2 list.
// Dùng SharePoint REST thay vì Graph vì REST $expand resolve được tên người
// (Author/Recruiter) ngay trong 1 request. Chỉ import khi !CONFIG.isDemo().
import { CONFIG } from "./config.js";

export class PermissionError extends Error {}

const MSAL_CDN = "https://alcdn.msauth.net/browser/3.28.1/js/msal-browser.min.js";
// Delegated SharePoint scope — đọc dưới quyền của chính người đang đăng nhập.
const SCOPES = [`https://${CONFIG.siteHost}/AllSites.Read`];

let msalApp = null;

function loadMsal() {
  return new Promise((resolve, reject) => {
    if (window.msal) return resolve();
    const s = document.createElement("script");
    s.src = MSAL_CDN;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Cannot load MSAL library"));
    document.head.appendChild(s);
  });
}

// Khởi tạo MSAL; trả về account nếu đã đăng nhập từ trước, ngược lại null.
export async function initAuth() {
  await loadMsal();
  msalApp = new window.msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: "sessionStorage" },
  });
  await msalApp.initialize();
  return msalApp.getAllAccounts()[0] || null;
}

export async function signIn() {
  const result = await msalApp.loginPopup({ scopes: SCOPES });
  return result.account;
}

async function getToken() {
  const account = msalApp.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in");
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  } catch {
    const r = await msalApp.acquireTokenPopup({ scopes: SCOPES, account });
    return r.accessToken;
  }
}

async function spGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" },
  });
  if (res.status === 403 || res.status === 401) throw new PermissionError(`${res.status} from SharePoint`);
  if (!res.ok) throw new Error(`SharePoint ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function listItems(listTitle, select, expand, token) {
  const site = `https://${CONFIG.siteHost}${CONFIG.sitePath}`;
  let url = `${site}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items` +
    `?$select=${select}&$expand=${expand}&$top=1000`;
  const items = [];
  while (url) {
    const page = await spGet(url, token);
    items.push(...page.value);
    url = page["odata.nextLink"] || null;
  }
  return items;
}

const num = (v) => (typeof v === "number" ? v : Number(v) || 0);

// Map 1:1 với cột của list (internal name → key của metrics engine).
function mapFunnel(items) {
  return items.map((it) => ({
    weekEnding: String(it.WeekEnding || "").slice(0, 10),
    position: it.Position || "",
    recruiter: it.Author?.Title || "Unknown",
    contacted: num(it.CandidatesContacted),
    responses: num(it.CandidatesResponses),
    applications: num(it.Applications),
    interviews: num(it.Interviews),
    offers: num(it.Offers),
    hires: num(it.Hires),
  })).filter((r) => r.weekEnding);
}

function mapAchievements(items) {
  return items.map((it) => ({
    month: String(it.KPIMonth || "").slice(0, 7),
    recruiter: it.Recruiter?.Title || "Unknown",
    kpiType: it.KPIType || "",
    title: it.Title || "",
  })).filter((a) => a.month && a.kpiType);
}

export async function getData() {
  const token = await getToken();
  const [funnelItems, kpiItems] = await Promise.all([
    listItems(CONFIG.funnelList,
      "WeekEnding,Position,CandidatesContacted,CandidatesResponses,Applications,Interviews,Offers,Hires,Author/Title",
      "Author", token),
    listItems(CONFIG.kpiList, "Title,KPIMonth,KPIType,Recruiter/Title", "Recruiter", token)
      .catch((e) => {
        if (e instanceof PermissionError) throw e;
        return []; // list KPI lỗi/đổi tên → dashboard vẫn chạy phần funnel
      }),
  ]);
  return { rows: mapFunnel(funnelItems), achievements: mapAchievements(kpiItems) };
}
