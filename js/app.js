import { CONFIG } from "./config.js";
import { DEMO_FUNNEL, DEMO_ACHIEVEMENTS } from "./data-demo.js";
import { initEntryUI, openKpiModal, toast } from "./entry.js";
import {
  filterRows, totals, rates, outcomeDistribution, leaderboard, monthlyKpi,
  positionSnapshots, rtoBenchmark, INTERVIEW_TARGET, RTO_TARGET, KPI_BONUS,
} from "./metrics.js";

// Loại data test / người ngoài team TA khỏi mọi thống kê.
const cleanRows = (rows) =>
  rows.filter((r) => !(CONFIG.excludeRecruiters || []).includes(r.recruiter));
const cleanAchievements = (list) =>
  list.filter((a) => !(CONFIG.excludeRecruiters || []).includes(a.recruiter));

const $ = (sel) => document.querySelector(sel);

// Series colors theo Eastgate tokens: semantic cho kết quả rõ nghĩa,
// thang xám ink cho các bậc rơi trung tính.
const OUTCOME_COLORS = {
  onboarded: "#1FA97D", failedInterview: "#3A4252",
  failedCV: "#6B7280", notApplied: "#94A3B8", noResponse: "#CBD5E1",
};

const state = {
  rows: [], achievements: [],
  // range: "all" | "30" | "7" | "custom" — preset pill hoặc user tự chọn
  // ngày trong 2 ô date; fromDate/toDate chỉ dùng khi range = "custom".
  range: "all", fromDate: null, toDate: null,
  recruiter: "", kpiMonth: null, // "YYYY-MM"
  activeStacks: [], // Admin chọn — benchmark RTO chạy trên danh sách này
  rtoFetcher: null, // hàm lấy RTO entries (demo hoặc list "TA Ready to Offer")
  rtoApi: null, // {updateStatus} — chuyển trạng thái ứng viên RTO
  rtoItems: null, // cache RTO entries sau lần fetch — KPI benchmark dùng lại
};

const fmtVND = (n) => n.toLocaleString("en-US") + " ₫";
const fmtDate = (iso) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).toUpperCase();
const monthLabel = (ym) =>
  new Date(ym + "-15T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function isoAddDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function maxWeek() {
  return state.rows.reduce((m, r) => (r.weekEnding > m ? r.weekEnding : m), "0000-00-00");
}

function minWeek() {
  return state.rows.reduce((m, r) => (r.weekEnding < m ? r.weekEnding : m), "9999-99-99");
}

// Khoảng ngày đang áp dụng. Preset 7/30 days tính lùi từ ngày log mới nhất
// (bao gồm ngày đó); "all" = null (không lọc); "custom" = 2 ô date của user.
function effectiveRange() {
  if (!state.rows.length) return { from: null, to: null };
  if (state.range === "custom") return { from: state.fromDate, to: state.toDate };
  if (state.range === "all") return { from: null, to: null };
  const to = maxWeek();
  return { from: isoAddDays(to, -(Number(state.range) - 1)), to };
}

// Khoảng hiển thị trên 2 ô date + label report: fallback về min/max của
// data để user luôn NHÌN THẤY report đang chạy từ ngày nào đến ngày nào.
function displayRange() {
  const { from, to } = effectiveRange();
  return {
    from: from || (state.rows.length ? minWeek() : ""),
    to: to || (state.rows.length ? maxWeek() : ""),
  };
}

function syncDateInputs() {
  const { from, to } = displayRange();
  $("#date-from").value = from;
  $("#date-to").value = to;
}

function activeRows() {
  const { from, to } = effectiveRange();
  return filterRows(state.rows, {
    recruiter: state.recruiter || undefined,
    fromDate: from || undefined,
    toDate: to || undefined,
  });
}

function months() {
  const set = new Set([
    ...state.rows.map((r) => r.weekEnding.slice(0, 7)),
    ...state.achievements.map((a) => a.month),
  ]);
  return [...set].sort();
}

/* ---------- renderers ---------- */

function renderKpiCards(t, r) {
  // 6 thẻ = đúng 6 cột số của list "Recruitment Funnel Weekly",
  // badge = tỷ lệ chuyển đổi so với bậc liền trước.
  const cards = [
    { label: "Candidates Contacted", icon: "👥", value: t.contacted, sub: "Funnel start" },
    { label: "Candidates Responses", icon: "💬", value: t.responses, badge: r.responseRate + "%", sub: "Response Rate" },
    { label: "Applications", icon: "📄", value: t.applications, badge: r.applicationRate + "%", sub: "Of Responses" },
    { label: "Interviews", icon: "💼", value: t.interviews, badge: r.interviewRate + "%", sub: "Of Applications" },
    { label: "Offers", icon: "🏅", value: t.offers, badge: r.offerRate + "%", sub: "Of Interviews" },
    { label: "Hires", icon: "🎉", value: t.hires, badge: r.hireRate + "%", sub: "Of Offers" },
  ];
  $("#kpi-cards").innerHTML = cards.map((c) => `
    <div class="kpi-card">
      <div class="k-head"><span>${c.label.toUpperCase()}</span><span>${c.icon}</span></div>
      <div class="k-value">${c.value.toLocaleString("en-US")}</div>
      <div class="k-sub">${c.badge ? `<span class="k-badge">${c.badge}</span>` : ""}<span>${c.sub}</span></div>
    </div>`).join("");
}

function renderTopPerformer(lb) {
  const el = $("#top-performer");
  if (!lb.length || lb[0].offers === 0) {
    el.innerHTML = `<span class="tp-tag">👑 TOP PERFORMER</span>
      <p style="opacity:.85">No offers under current filters yet.</p>`;
    return;
  }
  const top = lb[0];
  const { from, to } = displayRange();
  const scope = state.range === "all" ? "all-time" : `${fmtDate(from)} → ${fmtDate(to)}`;
  el.innerHTML = `
    <span class="tp-tag">👑 TOP PERFORMER</span>
    <div class="tp-row">
      <div class="tp-avatar">👑</div>
      <div>
        <div class="tp-name">${esc(top.recruiter)}</div>
        <div class="tp-desc">Most offers made ${scope}</div>
      </div>
    </div>
    <div class="tp-stats">
      <div><div class="label">OFFERS</div><div class="num">${top.offers}</div></div>
      <div><div class="label">CANDIDATES CONTACTED</div><div class="num">${top.intake}</div></div>
    </div>`;
}

function renderLeaderboard(lb) {
  const body = $("#leaderboard-body");
  if (!lb.length) {
    body.innerHTML = `<tr><td colspan="5" class="lb-empty">No data under current filters.</td></tr>`;
    return;
  }
  body.innerHTML = lb.map((x, i) => `
    <tr>
      <td class="lb-rank">${i === 0 ? "👑" : i + 1}</td>
      <td>${esc(x.recruiter)}</td>
      <td>${x.intake}</td>
      <td><span class="lb-offers">${x.offers}</span></td>
      <td class="lb-rate">${x.successRate}%</td>
    </tr>`).join("");
}

function renderOutcomes(t) {
  const dist = outcomeDistribution(t);
  const max = Math.max(...dist.map((d) => d.count), 1);
  $("#outcome-bars").innerHTML = dist.map((d) => `
    <div class="outcome-row">
      <div class="outcome-top">
        <span><span class="dot" style="background:${OUTCOME_COLORS[d.key]}"></span>${d.label}</span>
        <span><span class="cnt">${d.count}</span> <span class="pct">(${Math.round(d.pct)}%)</span></span>
      </div>
      <div class="outcome-bar"><i style="width:${(d.count / max) * 100}%;background:${OUTCOME_COLORS[d.key]}"></i></div>
    </div>`).join("");
}

function progressCell(label, value, target, bonusHit, srcTag) {
  const pct = Math.min(100, (value / target) * 100);
  return `
    <div class="kpi-cell">
      <div class="progress-label"><span>${label}${srcTag ? ` <span class="src">${srcTag}</span>` : ""}</span><span><b>${value}</b>/${target}</span></div>
      <div class="progress"><i class="${value >= target ? "hit" : ""}" style="width:${pct}%"></i></div>
      <div class="met">${value >= target ? "✓ Target met — " + fmtVND(bonusHit) : "&nbsp;"}</div>
    </div>`;
}

const fmtBonusShort = (n) =>
  n >= 1000000 ? (n / 1000000).toLocaleString("en-US") + "M" : n / 1000 + "K";

// Bảng quy tắc success-hire (KPIType → bonus) — render 1 lần từ KPI_BONUS
// để dashboard luôn khớp với engine tính.
function renderKpiLegend() {
  $("#kpi-legend").innerHTML =
    `<span class="legend-title">SUCCESS HIRE BONUS</span>` +
    Object.entries(KPI_BONUS).map(([type, bonus]) =>
      `<span class="chip">${esc(type)} <small>+${fmtBonusShort(bonus)}</small></span>`).join("");
}

function renderKpiBenchmark() {
  const ms = months();
  if (!state.kpiMonth || !ms.includes(state.kpiMonth)) state.kpiMonth = ms[ms.length - 1] || null;
  $("#kpi-month-label").textContent = state.kpiMonth ? monthLabel(state.kpiMonth) : "—";

  const container = $("#kpi-rows");
  if (!state.kpiMonth) { container.innerHTML = `<div class="kpi-empty">No data yet.</div>`; return; }

  // RTO từ list "TA Ready to Offer" có RTODate → đếm theo tháng được cho
  // MỌI tháng (monthlyKpi tự lọc theo rtoDate).
  const rtoItems = state.rtoItems
    ? state.rtoItems.filter((i) => !(CONFIG.excludeRecruiters || []).includes(i.recruiter))
    : null;

  let list = monthlyKpi(state.rows, state.achievements, state.kpiMonth, { rtoItems });
  if (state.recruiter) list = list.filter((x) => x.recruiter === state.recruiter);
  if (!list.length) { container.innerHTML = `<div class="kpi-empty">No activity for ${monthLabel(state.kpiMonth)}.</div>`; return; }

  container.innerHTML = list.map((x) => `
    <div class="kpi-row">
      <div class="kpi-who">
        <span class="avatar">${esc(x.recruiter.slice(0, 2).toUpperCase())}</span>
        <span>${esc(x.recruiter)}${x.topupBonus ? `<span class="topup">★ TOP-UP +${fmtVND(x.topupBonus)}</span>` : ""}</span>
      </div>
      ${progressCell("Interviews", x.interviews, INTERVIEW_TARGET, x.interviewsBonus || 1000000)}
      ${progressCell("Ready to Offer", x.rto, RTO_TARGET, x.rtoBonus || 1000000,
        x.rtoLive ? "TA LOG" : "")}
      <div class="kpi-cell">
        <div class="progress-label"><span>Success Hires</span><span><b>${x.achievements.length}</b></span></div>
        ${x.achievements.length
          ? `<div class="chips">${x.achievements.map((a) =>
              `<span class="chip" title="${esc(a.title || "")}">${esc(a.kpiType)} <small>+${fmtBonusShort(a.bonus)}</small></span>`).join("")}</div>`
          : `<div class="hires-empty">Chưa có hire trong tháng</div>`}
        <div class="met">${x.achievementsBonus ? "✓ +" + fmtVND(x.achievementsBonus) : "&nbsp;"}</div>
      </div>
      <div class="kpi-bonus">
        <div class="amount">${fmtVND(x.totalBonus)}</div>
        <div class="label">EST. BONUS THIS MONTH</div>
        <div class="bonus-lines">
          ${[["Interviews", x.interviewsBonus], ["Ready to Offer", x.rtoBonus],
             ["Success Hires", x.achievementsBonus]].map(([label, amount]) => `
            <div class="b-line ${amount ? "" : "zero"}">
              <span>${label}</span><b>${amount ? "+" + fmtVND(amount) : "0 ₫"}</b>
            </div>`).join("")}
          ${x.topupBonus ? `<div class="b-line"><span>Top-up</span><b>+${fmtVND(x.topupBonus)}</b></div>` : ""}
        </div>
      </div>
    </div>`).join("");
}

function renderPositions() {
  const target = CONFIG.interviewWeeklyTarget || 5;
  // Tôn trọng cả time filter lẫn recruiter filter — số liệu mỗi vị trí là
  // TỔNG các tuần trong khoảng đang chọn; target = 5/tuần × số tuần có log.
  const snaps = positionSnapshots(activeRows(), { interviewTarget: target });
  const { from, to } = displayRange();
  $("#positions-sub").textContent =
    `INTERVIEW TARGET = ${target}/WEEK · TOTALS ${from ? fmtDate(from) : "—"} → ${to ? fmtDate(to) : "—"}`;

  const counts = {
    red: snaps.filter((s) => s.status === "red").length,
    ontrack: snaps.filter((s) => s.status === "ontrack").length,
    filled: snaps.filter((s) => s.status === "filled").length,
  };
  $("#pos-stats").innerHTML = `
    <span class="pos-chip"><b>${snaps.length}</b> positions tracked</span>
    <span class="pos-chip red"><b>${counts.red}</b> behind target (&lt;${target}/wk)</span>
    <span class="pos-chip green"><b>${counts.ontrack}</b> on track</span>
    <span class="pos-chip teal"><b>${counts.filled}</b> filled</span>`;

  const grid = $("#pos-grid");
  if (!snaps.length) {
    grid.innerHTML = `<div class="kpi-empty">No position data yet.</div>`;
    return;
  }
  const badge = (s) =>
    s.status === "filled" ? `FILLED · ${s.hires} HIRE${s.hires > 1 ? "S" : ""}`
    : s.status === "ontrack" ? `ON TRACK · ${s.interviews}/${s.target}`
    : `BEHIND · ${s.interviews}/${s.target} (−${s.gap})`;
  grid.innerHTML = snaps.map((s) => {
    const max = Math.max(s.contacted, 1);
    const bar = (key, val, hl) => `
      <div class="pos-row ${hl ? "hl" : ""}">
        <span class="lbl">${key}</span>
        <span class="pos-bar"><i class="${hl ? (s.status === "red" ? "warn" : "ok") : ""}"
          style="width:${Math.min(100, (val / max) * 100)}%"></i></span>
        <span class="num">${val}</span>
      </div>`;
    return `
      <div class="pos-card ${s.status}">
        <div class="pos-head"><h3>${esc(s.position)}</h3>
          <span class="pos-badge ${s.status}">${badge(s)}</span></div>
        <div class="pos-week">${s.weeks} wk logged · latest ${fmtDate(s.weekEnding)}
          ${s.stale ? `<span class="stale"> · ⚠ NOT UPDATED THIS WEEK</span>` : ""}</div>
        ${bar("Contacted", s.contacted)}
        ${bar("Responses", s.responses)}
        ${bar("Applications", s.applications)}
        ${bar("Interviews", s.interviews, true)}
        ${bar("Offers", s.offers)}
        ${bar("Hires", s.hires)}
        <div class="pos-rates">resp ${s.rates.responseRate}% · apply ${s.rates.applicationRate}% ·
          interview ${s.rates.interviewRate}% · offer ${s.rates.offerRate}%</div>
        ${s.notes ? `<div class="pos-note">▸ ${esc(s.notes)}</div>` : ""}
      </div>`;
  }).join("");
}

// Card "Ready to Offer vs KPI" — nguồn: list "TA Ready to Offer" do TA log
// trên platform (nút ＋ Log RTO). Stock benchmark chỉ đếm ứng viên status
// Ready; KPI tháng đếm theo RTODate (flow) nên không phụ thuộc status.
// Load độc lập: list lỗi thì phần còn lại của dashboard vẫn chạy.
// Danh bạ RTO: TOÀN BỘ ứng viên đã log (mọi trạng thái), nhóm theo role —
// khác card benchmark (chỉ đếm Ready + chỉ active stacks).
function openRtoDirectory(items) {
  const byPos = new Map();
  for (const it of items) {
    if (!byPos.has(it.position)) byPos.set(it.position, []);
    byPos.get(it.position).push(it);
  }
  const groups = [...byPos.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const counts = { Ready: 0, Offered: 0, Hired: 0, Rejected: 0 };
  items.forEach((i) => { counts[i.status] = (counts[i.status] || 0) + 1; });
  const badge = (s) => `<span class="rto-status s-${s.toLowerCase()}">${s === "Ready" ? "Chờ offer" : s}</span>`;
  const row = (c) => `
    <tr class="${c.status !== "Ready" ? "muted-row" : ""}">
      <td>${c.profileLink ? `<a href="${esc(c.profileLink)}" target="_blank" rel="noopener">${esc(c.name)}</a>` : esc(c.name)}</td>
      <td>${esc(c.level || "—")}</td>
      <td>${esc(c.eng || "—")}</td>
      <td>${esc(c.recruiter)}</td>
      <td>${c.rtoDate ? fmtDate(c.rtoDate) : "—"}</td>
      <td>${badge(c.status)}</td>
    </tr>`;
  $("#modal-root").innerHTML = `
    <div class="modal-overlay">
      <div class="modal modal-wide">
        <div class="modal-head"><h2>☰ Ứng viên Ready to Offer theo role</h2>
          <button class="btn-icon" data-close>✕</button></div>
        <div class="pos-stats">
          <span class="pos-chip"><b>${items.length}</b> đã log</span>
          <span class="pos-chip green"><b>${counts.Ready}</b> đang chờ offer</span>
          <span class="pos-chip"><b>${counts.Offered}</b> offered</span>
          <span class="pos-chip teal"><b>${counts.Hired}</b> hired</span>
          <span class="pos-chip red"><b>${counts.Rejected}</b> rejected</span>
        </div>
        ${groups.length ? groups.map(([pos, list]) => `
          <h3 class="admin-h3">${esc(pos)} <small>(${list.filter((c) => c.status === "Ready").length} chờ offer / ${list.length} tổng)</small></h3>
          <div class="admin-scroll"><table class="lb-table admin-table">
            <thead><tr><th>Candidate</th><th>Level</th><th>ENG</th><th>Recruiter</th><th>RTO date</th><th>Status</th></tr></thead>
            <tbody>${list.slice().sort((a, b) => (a.status === "Ready" ? 0 : 1) - (b.status === "Ready" ? 0 : 1) || b.rtoDate.localeCompare(a.rtoDate)).map(row).join("")}</tbody>
          </table></div>`).join("")
          : `<div class="kpi-empty">Chưa có ứng viên nào được log — dùng nút ＋ Log RTO.</div>`}
      </div>
    </div>`;
  const root = $("#modal-root");
  root.querySelector("[data-close]").addEventListener("click", () => { root.innerHTML = ""; });
  root.querySelector(".modal-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) root.innerHTML = "";
  });
}

async function renderRtoBenchmark() {
  const { rtoTargetMin: min, rtoTargetMax: max } = CONFIG;
  const el = $("#offer-pipeline");
  el.hidden = false;
  el.onclick = (e) => { if (e.target.closest("#rto-viewall")) openRtoDirectory(state.rtoItems || []); };
  const head = `<div class="card-head"><h2>🎯 Ready to Offer vs KPI</h2>
    <div class="rto-head-right">
      <button class="btn-plain" id="rto-viewall">☰ Danh sách theo role</button>
      <span class="card-sub">TARGET ${min}–${max} / ACTIVE STACK · TA LOG</span>
    </div></div>`;
  el.innerHTML = `${head}<div class="kpi-empty">Loading…</div>`;
  let items;
  try { items = await state.rtoFetcher(); }
  catch (e) {
    el.innerHTML = `${head}<div class="kpi-empty">Không tải được list RTO — ${esc(e.message)}</div>`;
    return;
  }
  // Đồng bộ cột "Ready to Offer" của KPI benchmark với data log này.
  state.rtoItems = items;
  renderKpiBenchmark();
  if (!state.activeStacks.length) {
    el.innerHTML = `${head}<div class="kpi-empty">Admin chưa chọn active tech stacks —
      vào <b>Admin → Active tech stacks</b> để tick các vị trí đang tuyển.</div>`;
    return;
  }
  const ready = items.filter((i) => i.status === "Ready");
  const bench = rtoBenchmark(ready, { activeStacks: state.activeStacks, min });
  const totalRto = bench.reduce((s, b) => s + b.rto, 0);
  const withTarget = bench.filter((b) => !b.noTarget);
  const behind = withTarget.filter((b) => b.gap > 0).length;
  const ok = withTarget.length - behind;
  // Mỗi ứng viên có nút chuyển trạng thái — rời stock khi đã offer/hire/reject.
  const candidate = (c) => `
    <div class="rto-cand" data-id="${c.id}">
      <div class="rto-cand-info">
        ${c.profileLink ? `<a href="${esc(c.profileLink)}" target="_blank" rel="noopener">${esc(c.name)}</a>`
          : `<b>${esc(c.name)}</b>`}
        <small>${esc([c.level, c.eng && `EN ${c.eng}`].filter(Boolean).join(" · "))}</small>
        <small class="rto-meta">${esc(c.recruiter)} · RTO ${fmtDate(c.rtoDate)}</small>
      </div>
      <div class="rto-actions">
        <button data-status="Offered" title="Đã gửi offer">Offer</button>
        <button data-status="Hired" title="Đã nhận việc">Hire</button>
        <button data-status="Rejected" title="Từ chối / rớt">✕</button>
      </div>
    </div>`;
  // Cùng ngôn ngữ thiết kế với section Open Positions: hàng chips + lưới card.
  el.innerHTML = `${head}
    <div class="pos-stats">
      <span class="pos-chip"><b>${totalRto}</b> candidates ready to offer</span>
      <span class="pos-chip red"><b>${behind}</b>/${withTarget.length} stacks dưới target</span>
      <span class="pos-chip green"><b>${ok}</b> đạt target</span>
    </div>
    <div class="rto-grid">
      ${bench.map((b) => `
        <div class="pos-card ${b.noTarget ? "filled" : (b.gap ? "red" : "ontrack")}">
          <div class="pos-head"><h3>${esc(b.stack)}</h3>
            ${b.noTarget
              ? `<span class="pos-badge filled">${b.rto} · NGOÀI ACTIVE</span>`
              : `<span class="pos-badge ${b.gap ? "red" : "ontrack"}">
                  ${b.gap ? `${b.rto}/${min} · CẦN THÊM ${b.gap}` : `${b.rto}/${min} ✓`}</span>`}
          </div>
          ${b.noTarget ? "" : `<div class="progress"><i class="${b.gap ? "" : "hit"}"
            style="width:${Math.min(100, (b.rto / min) * 100)}%"></i></div>`}
          ${b.candidates.length ? `<div class="rto-names">${b.candidates.map(candidate).join("")}</div>`
            : `<div class="rto-names rto-empty">Chưa có ứng viên chờ offer</div>`}
        </div>`).join("")}
    </div>`;
  el.querySelectorAll(".rto-actions button").forEach((btn) => btn.addEventListener("click", async () => {
    const id = Number(btn.closest(".rto-cand").dataset.id);
    const status = btn.dataset.status;
    const cand = items.find((i) => i.id === id);
    if (!confirm(`${esc(cand?.name || "")} → ${status}? Ứng viên sẽ rời khỏi benchmark chờ offer.`)) return;
    btn.disabled = true;
    try {
      await state.rtoApi.updateStatus(id, status);
      toast(`✓ ${cand?.name || ""} → ${status}.`);
      await renderRtoBenchmark(); // refetch + đồng bộ lại KPI
      if (status === "Hired") openKpiModal(); // hire xong → log luôn achievement
    } catch (e) {
      toast("Không cập nhật được: " + e.message, false);
      btn.disabled = false;
    }
  }));
}

function renderAll() {
  syncDateInputs();
  const rows = activeRows();
  const t = totals(rows);
  renderKpiCards(t, rates(t));
  const lb = leaderboard(rows);
  renderTopPerformer(lb);
  renderLeaderboard(lb);
  renderOutcomes(t);
  renderPositions();
  renderKpiLegend();
  renderKpiBenchmark();
  $("#time-ref").textContent = state.rows.length ? fmtDate(maxWeek()) : "—";
}

/* ---------- wiring ---------- */

function fillRecruiterFilter() {
  const names = [...new Set(state.rows.map((r) => r.recruiter))].sort();
  $("#recruiter-filter").innerHTML =
    `<option value="">All Recruiters</option>` +
    names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
}

function bindEvents(reload) {
  $("#time-filter").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    state.range = btn.dataset.range;
    renderAll();
  });
  // User sửa 1 trong 2 ô ngày → chuyển sang chế độ custom, bỏ highlight pill.
  const onDateChange = () => {
    let from = $("#date-from").value || null;
    let to = $("#date-to").value || null;
    if (from && to && from > to) [from, to] = [to, from];
    state.range = "custom";
    state.fromDate = from;
    state.toDate = to;
    document.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    renderAll();
  };
  $("#date-from").addEventListener("change", onDateChange);
  $("#date-to").addEventListener("change", onDateChange);
  $("#recruiter-filter").addEventListener("change", (e) => {
    state.recruiter = e.target.value;
    renderAll();
  });
  $("#month-prev").addEventListener("click", () => stepMonth(-1));
  $("#month-next").addEventListener("click", () => stepMonth(1));
  $("#btn-refresh").addEventListener("click", reload);
}

function stepMonth(dir) {
  const ms = months();
  const i = ms.indexOf(state.kpiMonth) + dir;
  if (i >= 0 && i < ms.length) { state.kpiMonth = ms[i]; renderKpiBenchmark(); }
}

// API giả cho demo mode: ghi/xóa trong bộ nhớ để duyệt UI không cần SharePoint.
function demoApi() {
  const users = [...new Set(state.rows.map((r) => r.recruiter))]
    .map((name, i) => ({ id: i + 1, name, email: i === 0 ? "demo" : name.toLowerCase() }));
  return {
    addFunnelRow: async (f) => { state.rows.push({ ...f, recruiter: "Demo User" }); },
    addRtoEntry: async (f) => {
      state._demoRto.push({ ...f, id: Date.now(), recruiter: "Demo User", status: "Ready" });
    },
    addAchievement: async (f) => {
      state.achievements.push({
        month: f.month, kpiType: f.kpiType, title: f.title,
        recruiter: users.find((u) => u.id === f.recruiterId)?.name || "Demo User",
      });
    },
    deleteItem: async (list, id) => {
      if (list === CONFIG.funnelList) state.rows.splice(id, 1);
      else state.achievements.splice(id, 1);
    },
    getSiteUsers: async () => users,
    getRecentEntries: async () => ({
      funnel: state.rows.map((r, i) => ({
        Id: i, WeekEnding: r.weekEnding, Position: r.position,
        CandidatesContacted: r.contacted, CandidatesResponses: r.responses,
        Applications: r.applications, Interviews: r.interviews, Offers: r.offers,
        Hires: r.hires, Notes: r.notes || "", Author: { Title: r.recruiter },
        Created: r.weekEnding,
      })).reverse().slice(0, 100),
      kpi: state.achievements.map((a, i) => ({
        Id: i, KPIMonth: a.month + "-01", KPIType: a.kpiType, Title: a.title || "",
        Recruiter: { Title: a.recruiter }, Author: { Title: a.recruiter }, Created: a.month + "-01",
      })),
    }),
  };
}

async function boot() {
  if (CONFIG.isDemo()) {
    $("#demo-banner").hidden = false;
    state.rows = cleanRows(DEMO_FUNNEL);
    state.achievements = cleanAchievements(DEMO_ACHIEVEMENTS);
    $("#dashboard").hidden = false;
    fillRecruiterFilter();
    bindEvents(() => renderAll());
    renderAll();
    initEntryUI({
      isDemo: true, account: { name: "Demo User", username: "demo" }, api: demoApi(),
      reload: async () => { fillRecruiterFilter(); renderAll(); },
      refreshRto: () => renderRtoBenchmark(),
      stacks: {
        get: () => state.activeStacks,
        save: async (arr) => { state.activeStacks = arr; renderRtoBenchmark(); },
      },
    });
    state.activeStacks = ["Java", "Backend Web", "BA", "DevOps", "QA"];
    // Demo RTO: mảng in-memory, cùng shape với getRtoEntries() của graph.js.
    const demoRto = [
      { id: 1, name: "Nguyen Van A", position: "Java", level: "M1", eng: "6.0", recruiter: "AnhTD", status: "Ready", rtoDate: "2026-07-20", profileLink: "" },
      { id: 2, name: "Tran Thi B", position: "Java", level: "M2", eng: "6.5", recruiter: "MyLTP", status: "Ready", rtoDate: "2026-07-22", profileLink: "" },
      { id: 3, name: "Le Van C", position: "BA", level: "M1", eng: "6.0", recruiter: "LyPK", status: "Ready", rtoDate: "2026-07-25", profileLink: "" },
      { id: 4, name: "Pham Van D", position: "Backend Web", level: "M1+", eng: "7.0", recruiter: "DucPM", status: "Ready", rtoDate: "2026-07-26", profileLink: "" },
      { id: 5, name: "Hoang Thi E", position: "QA", level: "M1", eng: "5.5", recruiter: "AnhTD", status: "Ready", rtoDate: "2026-07-27", profileLink: "" },
      { id: 6, name: "Vu Van F", position: "QA", level: "M2", eng: "6.0", recruiter: "MyLTP", status: "Offered", rtoDate: "2026-07-15", profileLink: "" },
      { id: 7, name: "Dang Thi G", position: "MKT", level: "", eng: "6.0", recruiter: "VietBN", status: "Ready", rtoDate: "2026-07-24", profileLink: "" },
    ];
    state._demoRto = demoRto;
    state.rtoFetcher = async () => demoRto.slice();
    state.rtoApi = {
      updateStatus: async (id, status) => {
        const it = demoRto.find((i) => i.id === id);
        if (it) it.status = status;
      },
    };
    renderRtoBenchmark();
    return;
  }

  // Live mode — MSAL + SharePoint REST (js/graph.js)
  const graph = await import("./graph.js");
  const { initAuth, signIn, getData, PermissionError } = graph;
  const landing = $("#landing");
  landing.hidden = false;
  let entryReady = false;

  const loadDashboard = async () => {
    try {
      const { rows, achievements } = await getData();
      state.rows = cleanRows(rows);
      state.achievements = cleanAchievements(achievements);
      landing.hidden = true;
      $("#dashboard").hidden = false;
      fillRecruiterFilter();
      renderAll();
      if (!entryReady) {
        entryReady = true;
        initEntryUI({
          isDemo: false,
          account: graph.currentAccount(),
          api: graph,
          reload: loadDashboard,
          refreshRto: () => renderRtoBenchmark(),
          stacks: {
            get: () => state.activeStacks,
            save: async (arr) => {
              await graph.saveActiveStacks(arr);
              state.activeStacks = arr;
              renderRtoBenchmark();
            },
          },
        });
        (async () => {
          state.rtoFetcher = graph.getRtoEntries;
          state.rtoApi = { updateStatus: graph.updateRtoStatus };
          state.activeStacks = await graph.getActiveStacks().catch(() => []);
          renderRtoBenchmark();
        })();
      }
    } catch (err) {
      const msg = err instanceof PermissionError
        ? "Your account does not have access to the ORG HR Admin site. Please contact HR."
        : "Could not load data: " + err.message;
      const el = $("#landing-error");
      landing.hidden = false;
      $("#dashboard").hidden = true;
      el.textContent = msg;
      el.hidden = false;
    }
  };

  bindEvents(loadDashboard);
  $("#btn-signin").addEventListener("click", async () => {
    try {
      await signIn();
      await loadDashboard();
    } catch (err) {
      const el = $("#landing-error");
      el.textContent = "Sign-in failed: " + err.message;
      el.hidden = false;
    }
  });

  const account = await initAuth();
  if (account) await loadDashboard();
}

boot();
