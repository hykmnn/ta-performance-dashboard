import { CONFIG } from "./config.js";
import { DEMO_FUNNEL, DEMO_ACHIEVEMENTS } from "./data-demo.js";
import { initEntryUI } from "./entry.js";
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
  range: "all", recruiter: "", kpiMonth: null, // "YYYY-MM"
  activeStacks: [], // Admin chọn — benchmark RTO chạy trên danh sách này
  rtoFetcher: null, // hàm lấy RTO items (demo hoặc Azure Board)
  rtoItems: null, // cache RTO items sau lần fetch — KPI benchmark dùng lại
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

function activeRows() {
  const opts = { recruiter: state.recruiter || undefined };
  if (state.range !== "all" && state.rows.length) {
    opts.fromDate = isoAddDays(maxWeek(), -Number(state.range));
  }
  return filterRows(state.rows, opts);
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
  const scope = state.range === "all" ? "all-time" : `last ${state.range} days`;
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

  // RTO live từ Azure Board chỉ có "hiện trạng" — áp cho tháng hiện tại;
  // tháng quá khứ fallback về cột Offers của funnel (board không có lịch sử).
  const nowMonth = new Date().toISOString().slice(0, 7);
  const rtoItems = state.rtoItems && state.kpiMonth === nowMonth
    ? state.rtoItems.filter((i) => !(CONFIG.excludeRecruiters || []).includes(i.recruiter))
    : null;

  let list = monthlyKpi(state.rows, state.achievements, state.kpiMonth, { rtoItems });
  if (state.recruiter) list = list.filter((x) => x.recruiter === state.recruiter);
  if (!list.length) { container.innerHTML = `<div class="kpi-empty">No activity for ${monthLabel(state.kpiMonth)}.</div>`; return; }

  const bonusLine = (label, amount) => amount
    ? `<div class="b-line"><span>${label}</span><b>+${fmtVND(amount)}</b></div>` : "";

  container.innerHTML = list.map((x) => `
    <div class="kpi-row">
      <div class="kpi-who">
        <span class="avatar">${esc(x.recruiter.slice(0, 2).toUpperCase())}</span>
        <span>${esc(x.recruiter)}${x.topupBonus ? `<span class="topup">★ TOP-UP +${fmtVND(x.topupBonus)}</span>` : ""}</span>
      </div>
      ${progressCell("Interviews", x.interviews, INTERVIEW_TARGET, x.interviewsBonus || 1000000)}
      ${progressCell("Ready to Offer", x.rto, RTO_TARGET, x.rtoBonus || 1000000,
        x.rtoLive ? "AZURE BOARD" : "")}
      <div class="kpi-bonus">
        <div class="amount">${fmtVND(x.totalBonus)}</div>
        <div class="label">EST. BONUS THIS MONTH</div>
        <div class="bonus-lines">
          ${bonusLine(`Interviews ≥ ${INTERVIEW_TARGET}`, x.interviewsBonus)}
          ${bonusLine(`Ready to Offer ≥ ${RTO_TARGET}`, x.rtoBonus)}
          ${bonusLine("Top-up (đạt cả 2)", x.topupBonus)}
          ${bonusLine(`Success hires (${x.achievements.length})`, x.achievementsBonus)}
          ${x.totalBonus === 0 ? `<div class="b-line none">Chưa đạt mốc bonus nào</div>` : ""}
        </div>
        ${x.achievements.length ? `<div class="chips">${x.achievements.map((a) =>
          `<span class="chip" title="${esc(a.title || "")}">${esc(a.kpiType)} <small>+${fmtBonusShort(a.bonus)}</small></span>`).join("")}</div>` : ""}
      </div>
    </div>`).join("");
}

function renderPositions() {
  const target = CONFIG.interviewWeeklyTarget || 5;
  // Tôn trọng cả time filter lẫn recruiter filter — snapshot lấy tuần gần
  // nhất của từng vị trí TRONG khoảng đang chọn (vị trí không có data trong
  // khoảng đó sẽ không hiện).
  const snaps = positionSnapshots(activeRows(), { interviewTarget: target });
  $("#positions-sub").textContent =
    `INTERVIEW TARGET = ${target}/WEEK · LATEST WEEK PER POSITION` +
    (state.range === "all" ? "" : ` · LAST ${state.range} DAYS`);

  const counts = {
    red: snaps.filter((s) => s.status === "red").length,
    ontrack: snaps.filter((s) => s.status === "ontrack").length,
    filled: snaps.filter((s) => s.status === "filled").length,
  };
  $("#pos-stats").innerHTML = `
    <span class="pos-chip"><b>${snaps.length}</b> positions tracked</span>
    <span class="pos-chip red"><b>${counts.red}</b> behind target (&lt;${target} interviews)</span>
    <span class="pos-chip green"><b>${counts.ontrack}</b> on track</span>
    <span class="pos-chip teal"><b>${counts.filled}</b> filled</span>`;

  const grid = $("#pos-grid");
  if (!snaps.length) {
    grid.innerHTML = `<div class="kpi-empty">No position data yet.</div>`;
    return;
  }
  const badge = (s) =>
    s.status === "filled" ? `FILLED · ${s.hires} HIRE${s.hires > 1 ? "S" : ""}`
    : s.status === "ontrack" ? `ON TRACK · ${s.interviews}/${target}`
    : `BEHIND · ${s.interviews}/${target} (−${s.gap})`;
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
        <div class="pos-week">Wk ending ${fmtDate(s.weekEnding)}
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

// Card "Ready to Offer vs KPI" — RTO items live từ Azure Board, benchmark
// trên danh sách active stacks do Admin chọn (kể cả stack 0 ứng viên).
// Load độc lập: board lỗi/chưa cấp quyền thì phần còn lại vẫn chạy.
async function renderRtoBenchmark() {
  const { rtoTargetMin: min, rtoTargetMax: max } = CONFIG.ado;
  const el = $("#offer-pipeline");
  el.hidden = false;
  const head = `<div class="card-head"><h2>🎯 Ready to Offer vs KPI</h2>
    <span class="card-sub">TARGET ${min}–${max} / ACTIVE STACK · AZURE BOARD</span></div>`;
  if (!state.activeStacks.length) {
    el.innerHTML = `${head}<div class="kpi-empty">Admin chưa chọn active tech stacks —
      vào <b>Admin → Active tech stacks</b> để tick các vị trí đang tuyển.</div>`;
    return;
  }
  el.innerHTML = `${head}<div class="kpi-empty">Loading…</div>`;
  let items;
  try { items = await state.rtoFetcher(); }
  catch (e) {
    el.innerHTML = `${head}<div class="kpi-empty">Không tải được từ Azure Board — ${esc(e.message)}</div>`;
    return;
  }
  // Đồng bộ cột "Ready to Offer" của KPI benchmark với đúng data board này.
  state.rtoItems = items;
  renderKpiBenchmark();
  const bench = rtoBenchmark(items, {
    activeStacks: state.activeStacks, aliases: CONFIG.stackAliases, min,
  });
  const totalRto = bench.reduce((s, b) => s + b.rto, 0);
  const withTarget = bench.filter((b) => !b.noTarget);
  const behind = withTarget.filter((b) => b.gap > 0).length;
  const ok = withTarget.length - behind;
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
              ? `<span class="pos-badge filled">${b.rto} · NGOÀI DANH SÁCH</span>`
              : `<span class="pos-badge ${b.gap ? "red" : "ontrack"}">
                  ${b.gap ? `${b.rto}/${min} · CẦN THÊM ${b.gap}` : `${b.rto}/${min} ✓`}</span>`}
          </div>
          ${b.noTarget ? "" : `<div class="progress"><i class="${b.gap ? "" : "hit"}"
            style="width:${Math.min(100, (b.rto / min) * 100)}%"></i></div>`}
          ${b.candidates.length ? `<div class="rto-names">${b.candidates.map((c) =>
            `<a href="${esc(c.url)}" target="_blank" rel="noopener" title="${esc(c.title)}">${esc(c.name)}</a> <small>(${esc(c.recruiter)})</small>`
          ).join("<br>")}</div>` : `<div class="rto-names rto-empty">Chưa có ứng viên chờ offer</div>`}
        </div>`).join("")}
    </div>`;
}

function renderAll() {
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
      stacks: {
        get: () => state.activeStacks,
        save: async (arr) => { state.activeStacks = arr; renderRtoBenchmark(); },
      },
    });
    state.activeStacks = ["Java", "Backend Web", "BA", "DevOps", "QA"];
    state.rtoFetcher = async () => [
      { id: 1, title: "M1 Java (EN 6.0) / SU - Nguyen Van A", recruiter: "AnhTD", url: "#" },
      { id: 2, title: "M2/S1 Java (EN 6.0) / TO - Tran Thi B", recruiter: "MyLTP", url: "#" },
      { id: 3, title: "M1 BA (EN 6.0) / TO - Le Van C", recruiter: "LyPK", url: "#" },
      { id: 4, title: "M1+ BE Web (EN 7.0) / SU - Pham Van D", recruiter: "DucPM", url: "#" },
      { id: 5, title: "M1 QA / TO - E", url: "#" }, { id: 6, title: "M1 QA / TO - F", url: "#" },
      { id: 7, title: "M1 QA / TO - G", url: "#" }, { id: 8, title: "M1 QA / TO - H", url: "#" },
      { id: 9, title: "VB Growth Assistant (EN 6.0) / BD - I", recruiter: "VietBN", url: "#" },
    ];
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
          try {
            const ado = await import("./ado.js");
            state.rtoFetcher = ado.getRtoItems;
            state.activeStacks = await graph.getActiveStacks().catch(() => []);
          } catch { state.rtoFetcher = async () => []; }
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
