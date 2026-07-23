// Live mode: MSAL (đăng nhập Microsoft) + SharePoint REST đọc 2 list.
// Dùng SharePoint REST thay vì Graph vì REST $expand resolve được tên người
// (Author/Recruiter) ngay trong 1 request. Chỉ import khi !CONFIG.isDemo().
import { CONFIG } from "./config.js";

export class PermissionError extends Error {}

const MSAL_CDN = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.30.0/lib/msal-browser.min.js";
// Delegated SharePoint scope — thao tác dưới quyền của chính người đăng nhập.
// AllSites.Write bao trùm Read (scope SharePoint có thứ bậc), cho phép form
// trên platform ghi thẳng vào list.
const SCOPES = [`https://${CONFIG.siteHost}/AllSites.Write`];

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

// Khởi tạo MSAL (redirect flow — không dùng popup vì hay bị browser chặn);
// trả về account nếu đã đăng nhập, ngược lại null.
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
  const result = await msalApp.handleRedirectPromise(); // hứng kết quả khi quay về từ trang login
  if (result?.account) return result.account;
  return msalApp.getAllAccounts()[0] || null;
}

export async function signIn() {
  if (!msalApp) await initAuth();
  await msalApp.loginRedirect({ scopes: SCOPES }); // rời trang → quay lại sau khi đăng nhập
}

// Lấy token cho resource bất kỳ (SharePoint, Azure DevOps...). Dùng chung
// cho graph.js và ado.js — mỗi resource một scope riêng, MSAL tự cache.
export async function acquireToken(scopes) {
  const account = msalApp?.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in");
  try {
    const r = await msalApp.acquireTokenSilent({ scopes, account });
    return r.accessToken;
  } catch {
    // Cần consent/scope mới → redirect cả trang rồi quay lại.
    await msalApp.acquireTokenRedirect({ scopes, account });
    return new Promise(() => {}); // trang sẽ rời đi — treo promise cho tới lúc đó
  }
}

const getToken = () => acquireToken(SCOPES);

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
    notes: it.Notes || "",
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

export function currentAccount() {
  const a = msalApp?.getAllAccounts()[0];
  return a ? { name: a.name || a.username, username: (a.username || "").toLowerCase() } : null;
}

const siteUrl = () => `https://${CONFIG.siteHost}${CONFIG.sitePath}`;

// Ghi/xóa qua REST + Bearer token: không cần X-RequestDigest.
async function spWrite(url, { method = "POST", body, headers = {} } = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=nometadata",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 403 || res.status === 401) throw new PermissionError(`${res.status} from SharePoint`);
  if (!res.ok) {
    let msg = `SharePoint ${res.status}`;
    try { msg = (await res.json())["odata.error"]?.message?.value || msg; } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

// fields ví dụ: {WeekEnding: "2026-07-19", Position: "Java", CandidatesContacted: 5, ...}
// Date gửi dạng noon UTC để không lệch ngày (site timezone Pacific).
export function addFunnelRow(f) {
  return spWrite(`${siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(CONFIG.funnelList)}')/items`, {
    body: {
      WeekEnding: `${f.weekEnding}T12:00:00Z`,
      Position: f.position,
      CandidatesContacted: f.contacted,
      CandidatesResponses: f.responses,
      Applications: f.applications,
      Interviews: f.interviews,
      Offers: f.offers,
      Hires: f.hires,
      Notes: f.notes || "",
    },
  });
}

export function addAchievement(f) {
  return spWrite(`${siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(CONFIG.kpiList)}')/items`, {
    body: {
      Title: f.title || "",
      KPIMonth: `${f.month}-01T12:00:00Z`,
      RecruiterId: f.recruiterId,
      KPIType: f.kpiType,
    },
  });
}

export function deleteItem(listTitle, id) {
  return spWrite(`${siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items(${id})`, {
    headers: { "X-HTTP-Method": "DELETE", "IF-MATCH": "*" },
  });
}

// Settings dùng chung, lưu trong list "TA Settings" (Title = key, Value = JSON).
export async function getActiveStacks() {
  const token = await getToken();
  const data = await spGet(
    `${siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(CONFIG.settingsList)}')/items` +
    `?$select=Id,Title,Value&$filter=Title eq 'activeStacks'&$top=1`, token);
  const item = data.value?.[0];
  if (!item) return [];
  try { return JSON.parse(item.Value) || []; } catch { return []; }
}

export async function saveActiveStacks(stacks) {
  const token = await getToken();
  const base = `${siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(CONFIG.settingsList)}')/items`;
  const data = await spGet(`${base}?$select=Id,Title&$filter=Title eq 'activeStacks'&$top=1`, token);
  const existing = data.value?.[0];
  if (existing) {
    return spWrite(`${base}(${existing.Id})`, {
      headers: { "X-HTTP-Method": "MERGE", "IF-MATCH": "*" },
      body: { Value: JSON.stringify(stacks) },
    });
  }
  return spWrite(base, { body: { Title: "activeStacks", Value: JSON.stringify(stacks) } });
}

// Người dùng thật của site (cho dropdown Recruiter).
export async function getSiteUsers() {
  const token = await getToken();
  const data = await spGet(
    `${siteUrl()}/_api/web/siteusers?$select=Id,Title,Email,PrincipalType&$filter=PrincipalType eq 1`, token);
  return data.value
    .filter((u) => u.Email)
    .map((u) => ({ id: u.Id, name: u.Title, email: u.Email.toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Entries gần nhất của cả 2 list (cho màn Admin).
export async function getRecentEntries() {
  const token = await getToken();
  const q = (list, select, expand) =>
    spGet(`${siteUrl()}/_api/web/lists/getbytitle('${encodeURIComponent(list)}')/items` +
      `?$select=Id,Created,Author/Title,${select}&$expand=Author${expand ? "," + expand : ""}` +
      `&$orderby=Created desc&$top=100`, token);
  const [funnel, kpi] = await Promise.all([
    q(CONFIG.funnelList, "WeekEnding,Position,CandidatesContacted,CandidatesResponses,Applications,Interviews,Offers,Hires,Notes"),
    q(CONFIG.kpiList, "Title,KPIMonth,KPIType,Recruiter/Title", "Recruiter").catch(() => ({ value: [] })),
  ]);
  return { funnel: funnel.value, kpi: kpi.value };
}

export async function getData() {
  const token = await getToken();
  const [funnelItems, kpiItems] = await Promise.all([
    listItems(CONFIG.funnelList,
      "WeekEnding,Position,CandidatesContacted,CandidatesResponses,Applications,Interviews,Offers,Hires,Notes,Author/Title",
      "Author", token),
    listItems(CONFIG.kpiList, "Title,KPIMonth,KPIType,Recruiter/Title", "Recruiter", token)
      .catch((e) => {
        if (e instanceof PermissionError) throw e;
        return []; // list KPI lỗi/đổi tên → dashboard vẫn chạy phần funnel
      }),
  ]);
  return { rows: mapFunnel(funnelItems), achievements: mapAchievements(kpiItems) };
}
