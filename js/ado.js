// Đọc Ready-to-offer từ Azure DevOps Boards (real-time) để benchmark KPI
// "4–5 RTO candidates / active tech stack".
// Auth: cùng đăng nhập Microsoft của platform — token riêng cho resource
// Azure DevOps (app id chuẩn 499b84ac-..., delegated user_impersonation).
import { CONFIG } from "./config.js";
import { acquireToken } from "./graph.js";

const ADO_SCOPES = ["499b84ac-1321-427f-aa17-267ca6975798/user_impersonation"];

async function adoFetch(path, { method = "GET", body } = {}) {
  const token = await acquireToken(ADO_SCOPES);
  const url = `https://dev.azure.com/${CONFIG.ado.org}/${encodeURIComponent(CONFIG.ado.project)}/_apis/${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Azure DevOps ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

// Trả về các card đang ở cột Ready-to-offer: [{id, title, recruiter, url}].
export async function getRtoItems() {
  const wiql = await adoFetch("wit/wiql?api-version=7.1", {
    method: "POST",
    body: {
      query: `SELECT [System.Id] FROM WorkItems ` +
        `WHERE [System.TeamProject] = '${CONFIG.ado.project}' ` +
        `AND [System.BoardColumn] = '${CONFIG.ado.rtoColumn}'`,
    },
  });
  const ids = (wiql.workItems || []).map((w) => w.id).slice(0, 150);
  if (!ids.length) return [];

  const detail = await adoFetch(
    `wit/workitems?ids=${ids.join(",")}` +
    `&fields=System.Id,System.Title,System.AssignedTo&api-version=7.1`);
  return (detail.value || []).map((w) => ({
    id: w.id,
    title: w.fields?.["System.Title"] || "",
    recruiter: w.fields?.["System.AssignedTo"]?.displayName || "—",
    url: `https://dev.azure.com/${CONFIG.ado.org}/${encodeURIComponent(CONFIG.ado.project)}/_workitems/edit/${w.id}`,
  }));
}
