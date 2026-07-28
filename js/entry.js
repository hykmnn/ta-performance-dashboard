// UI nhập liệu (Log Daily / Log KPI) + màn Admin.
// Không gọi mạng trực tiếp — mọi thao tác data đi qua ctx.api để app.js
// quyết định demo (in-memory) hay live (SharePoint REST).
import { CONFIG } from "./config.js";
import { validateFunnelEntry, KPI_BONUS } from "./metrics.js";

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtVND = (n) => n.toLocaleString("en-US") + " ₫";

let ctx = null; // {isDemo, account, api, reload}

export function toast(msg, ok = true) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + (ok ? "ok" : "err");
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 4000);
}

// Hôm nay theo giờ local (không dùng toISOString trực tiếp — lệch múi giờ).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastMonths(n = 6) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(new Date(Date.UTC(d.getFullYear(), d.getMonth() - i, 15)).toISOString().slice(0, 7));
  }
  return out;
}

function closeModal() { $("#modal-root").innerHTML = ""; }

function modal(title, bodyHtml, onSubmit, submitLabel = "Save") {
  $("#modal-root").innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-head"><h2>${esc(title)}</h2>
          <button class="btn-icon" data-close>✕</button></div>
        <form id="modal-form">${bodyHtml}
          <p class="form-error" id="form-error" hidden></p>
          <div class="modal-foot">
            <button type="button" class="btn-plain" data-close>Cancel</button>
            <button type="submit" class="btn-primary" id="modal-submit">${esc(submitLabel)}</button>
          </div>
        </form>
      </div>
    </div>`;
  const root = $("#modal-root");
  root.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  root.querySelector(".modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  root.querySelector("#modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#modal-submit");
    const errEl = $("#form-error");
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await onSubmit(new FormData(e.target));
      closeModal();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = submitLabel;
    }
  });
}

const numField = (name, label) => `
  <label class="f-field f-num"><span>${label}</span>
    <input type="number" name="${name}" min="0" step="1" value="0" required></label>`;

export function openWeeklyModal() {
  const today = todayISO();
  modal("Log Daily Funnel", `
    <div class="f-row">
      <label class="f-field"><span>Date</span>
        <input type="date" name="weekEnding" value="${today}" max="${today}" required></label>
      <label class="f-field"><span>Position</span>
        <select name="position">${CONFIG.positions.map((p) => `<option>${esc(p)}</option>`).join("")}</select></label>
    </div>
    <div class="f-grid">
      ${numField("contacted", "Contacted")}${numField("responses", "Responses")}
      ${numField("applications", "Applications")}${numField("interviews", "Interviews")}
      ${numField("offers", "Offers")}${numField("hires", "Hires")}
    </div>
    <label class="f-field"><span>Notes (hiện ở Open Positions)</span>
      <input type="text" name="notes" placeholder="VD: Ready to offer 2 bạn M1..."></label>
    <p class="f-hint">Nhập số phát sinh TRONG NGÀY cho vị trí bạn phụ trách — log nhiều
      lần/ngày hoặc bỏ trống ngày không có hoạt động đều được, dashboard tự cộng dồn.
      Có thể chọn ngày trong quá khứ để bổ sung.</p>
  `, async (fd) => {
    const entry = {
      weekEnding: fd.get("weekEnding"),
      position: fd.get("position"),
      notes: (fd.get("notes") || "").trim(),
    };
    for (const k of ["contacted", "responses", "applications", "interviews", "offers", "hires"]) {
      entry[k] = Number(fd.get(k));
    }
    const err = validateFunnelEntry(entry);
    if (err) throw new Error(err);
    await ctx.api.addFunnelRow(entry);
    toast(ctx.isDemo ? "DEMO — đã thêm vào bộ nhớ (chưa lưu thật)." : "✓ Đã lưu vào SharePoint.");
    await ctx.reload();
  });
}

export async function openKpiModal() {
  let users = [];
  try { users = await ctx.api.getSiteUsers(); } catch { /* dropdown rỗng vẫn dùng được */ }
  const me = ctx.account?.username;
  const months = lastMonths();
  modal("Log KPI Achievement", `
    <div class="f-row">
      <label class="f-field"><span>Month</span>
        <select name="month">${months.map((m, i) =>
          `<option value="${m}" ${i === 0 ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      <label class="f-field"><span>Recruiter</span>
        <select name="recruiterId" required>${users.map((u) =>
          `<option value="${u.id}" ${u.email === me ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label>
    </div>
    <div class="kpi-type-list">
      ${Object.entries(KPI_BONUS).map(([type, bonus], i) => `
        <label class="kpi-type">
          <input type="radio" name="kpiType" value="${esc(type)}" ${i === 0 ? "checked" : ""}>
          <span>${esc(type)}</span><b>+${fmtVND(bonus)}</b>
        </label>`).join("")}
    </div>
    <label class="f-field"><span>Candidate / note</span>
      <input type="text" name="title" placeholder="VD: Nguyen Van A — Senior Java"></label>
  `, async (fd) => {
    await ctx.api.addAchievement({
      month: fd.get("month"),
      recruiterId: Number(fd.get("recruiterId")),
      kpiType: fd.get("kpiType"),
      title: (fd.get("title") || "").trim(),
    });
    toast(ctx.isDemo ? "DEMO — đã thêm vào bộ nhớ (chưa lưu thật)." : "✓ Đã lưu vào SharePoint.");
    await ctx.reload();
  });
}

export async function openAdmin() {
  const sec = $("#admin-section");
  if (!sec.hidden) { sec.hidden = true; return; } // toggle
  sec.hidden = false;
  sec.innerHTML = `<div class="card-head"><h2>🛠 Admin — Recent Entries</h2>
    <span class="card-sub">LOADING…</span></div>`;
  let data;
  try { data = await ctx.api.getRecentEntries(); }
  catch (e) { sec.innerHTML = `<div class="kpi-empty">Không tải được entries: ${esc(e.message)}</div>`; return; }

  const { funnel, kpi } = data;
  const week = (iso) => String(iso || "").slice(0, 10);
  // Log theo ngày → checklist "còn thiếu" xét cửa sổ 7 ngày gần nhất
  // (tính từ ngày log mới nhất), không xét đúng 1 ngày.
  const latestDay = funnel.reduce((m, r) => (week(r.WeekEnding) > m ? week(r.WeekEnding) : m), "");
  const cutoff = latestDay
    ? new Date(new Date(latestDay + "T12:00:00Z").getTime() - 6 * 86400000).toISOString().slice(0, 10)
    : "";
  const loggedPositions = new Set(funnel.filter((r) => week(r.WeekEnding) >= cutoff).map((r) => r.Position));
  const missing = CONFIG.positions.filter((p) => !loggedPositions.has(p));

  const currentStacks = ctx.stacks ? ctx.stacks.get() : [];
  sec.innerHTML = `
    <div class="card-head"><h2>🛠 Admin — Recent Entries</h2>
      <button class="btn-plain" id="admin-close">Close</button></div>
    ${ctx.stacks ? `
    <h3 class="admin-h3">Active tech stacks — benchmark Ready to Offer (${CONFIG.ado.rtoTargetMin}–${CONFIG.ado.rtoTargetMax}/stack)</h3>
    <div class="stack-picker" id="stack-picker">
      ${CONFIG.positions.map((p) => `
        <label class="stack-chip">
          <input type="checkbox" value="${esc(p)}" ${currentStacks.includes(p) ? "checked" : ""}>
          <span>${esc(p)}</span>
        </label>`).join("")}
      <button class="btn-primary" id="stacks-save">Save stacks</button>
    </div>` : ""}
    <p class="kpi-note">7 ngày gần nhất (${cutoff || "—"} → <b>${latestDay || "—"}</b>) còn thiếu:
      ${missing.length ? missing.map((p) => `<span class="chip">${esc(p)}</span>`).join(" ") : `<b>đủ ${CONFIG.positions.length} vị trí ✓</b>`}</p>
    <h3 class="admin-h3">Funnel entries (${funnel.length})</h3>
    <div class="admin-scroll"><table class="lb-table admin-table">
      <thead><tr><th>Date</th><th>Position</th><th>C/R/A/I/O/H</th><th>Notes</th><th>By</th><th>Created</th><th></th></tr></thead>
      <tbody>${funnel.map((r) => `
        <tr>
          <td>${week(r.WeekEnding)}</td><td>${esc(r.Position || "")}</td>
          <td>${r.CandidatesContacted}/${r.CandidatesResponses}/${r.Applications}/${r.Interviews}/${r.Offers}/${r.Hires}</td>
          <td class="admin-notes">${esc(r.Notes || "")}</td>
          <td>${esc(r.Author?.Title || "")}</td>
          <td>${String(r.Created).slice(0, 10)}</td>
          <td><button class="btn-del" data-list="funnel" data-id="${r.Id}">🗑</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
    <h3 class="admin-h3">KPI achievements (${kpi.length})</h3>
    <div class="admin-scroll"><table class="lb-table admin-table">
      <thead><tr><th>Month</th><th>Recruiter</th><th>KPI Type</th><th>Candidate</th><th>By</th><th></th></tr></thead>
      <tbody>${kpi.map((r) => `
        <tr>
          <td>${String(r.KPIMonth || "").slice(0, 7)}</td>
          <td>${esc(r.Recruiter?.Title || "")}</td>
          <td>${esc(r.KPIType || "")}</td>
          <td>${esc(r.Title || "")}</td>
          <td>${esc(r.Author?.Title || "")}</td>
          <td><button class="btn-del" data-list="kpi" data-id="${r.Id}">🗑</button></td>
        </tr>`).join("")}</tbody>
    </table></div>`;

  $("#admin-close").addEventListener("click", () => { sec.hidden = true; });
  const saveBtn = $("#stacks-save");
  if (saveBtn) saveBtn.addEventListener("click", async () => {
    const selected = [...sec.querySelectorAll('#stack-picker input:checked')].map((i) => i.value);
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      await ctx.stacks.save(selected);
      toast(ctx.isDemo ? "DEMO — đã áp dụng (chưa lưu thật)." : "✓ Đã lưu active stacks.");
    } catch (e) {
      toast("Không lưu được: " + e.message, false);
    }
    saveBtn.disabled = false;
    saveBtn.textContent = "Save stacks";
  });
  sec.querySelectorAll(".btn-del").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Xóa dòng này? (không hoàn tác được)")) return;
    b.disabled = true;
    try {
      await ctx.api.deleteItem(b.dataset.list === "funnel" ? CONFIG.funnelList : CONFIG.kpiList, Number(b.dataset.id));
      toast(ctx.isDemo ? "DEMO — đã xóa khỏi bộ nhớ." : "✓ Đã xóa.");
      await ctx.reload();
      sec.hidden = true;
      openAdmin(); // vẽ lại bảng
    } catch (e) {
      toast("Không xóa được: " + e.message, false);
      b.disabled = false;
    }
  }));
}

export function initEntryUI(context) {
  ctx = context;
  $("#btn-log-weekly").hidden = false;
  $("#btn-log-kpi").hidden = false;
  $("#btn-log-weekly").addEventListener("click", openWeeklyModal);
  $("#btn-log-kpi").addEventListener("click", openKpiModal);
  const isAdmin = ctx.isDemo ||
    (ctx.account && (CONFIG.admins || []).includes(ctx.account.username));
  if (isAdmin) {
    $("#btn-admin").hidden = false;
    $("#btn-admin").addEventListener("click", openAdmin);
  }
}
