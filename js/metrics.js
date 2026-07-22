// Pure calculation engine — không phụ thuộc DOM hay nguồn data.
// rows: {weekEnding "YYYY-MM-DD", position, recruiter, contacted,
//        responses, applications, interviews, offers, hires}
// — 6 chỉ số khớp 1:1 với cột của list "Recruitment Funnel Weekly".
// achievements: {month "YYYY-MM", recruiter, kpiType, title}

export const KPI_BONUS = {
  "TL S1/S2 pass probation": 5000000,
  "IT S1/S2 pass probation": 3000000,
  "IT M1/M2 pass probation": 2000000,
  "IT J1/J2 pass probation": 1000000,
  "IT M/S service contract cycle": 500000,
  "Time-to-fill ≤ 30 days": 500000,
  "Non-IT pass probation": 500000,
};

export const INTERVIEW_TARGET = 40;
export const RTO_TARGET = 8;
export const INTERVIEW_BONUS = 1000000;
export const RTO_BONUS = 1000000;
export const TOPUP_BONUS = 500000;

const FUNNEL_KEYS = ["contacted", "responses", "applications", "interviews", "offers", "hires"];

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export function filterRows(rows, { fromDate, toDate, recruiter } = {}) {
  return rows.filter((r) =>
    (!fromDate || r.weekEnding >= fromDate) &&
    (!toDate || r.weekEnding <= toDate) &&
    (!recruiter || r.recruiter === recruiter));
}

export function totals(rows) {
  const t = Object.fromEntries(FUNNEL_KEYS.map((k) => [k, 0]));
  for (const r of rows) for (const k of FUNNEL_KEYS) t[k] += r[k] || 0;
  return t;
}

// Tỷ lệ chuyển đổi giữa các bậc liên tiếp của funnel.
export function rates(t) {
  return {
    responseRate: pct(t.responses, t.contacted),
    applicationRate: pct(t.applications, t.responses),
    interviewRate: pct(t.interviews, t.applications),
    offerRate: pct(t.offers, t.interviews),
    hireRate: pct(t.hires, t.offers),
  };
}

export function outcomeDistribution(t) {
  // 6 bậc rơi của funnel, telescoping về đúng tổng Contacted.
  // Interviews có thể > Applications (nhiều vòng PV) → clamp 0 và bù phần
  // chênh vào bậc kế trước để tổng vẫn khớp.
  const raw = [
    ["onboarded", "Onboarded", t.hires],
    ["declinedOffer", "Declined Offer", t.offers - t.hires],
    ["failedInterview", "Failed Interview", t.interviews - t.offers],
    ["failedCV", "Failed CV", t.applications - t.interviews],
    ["notApplied", "Not Applied", t.responses - t.applications],
    ["noResponse", "No Response", t.contacted - t.responses],
  ];
  let carry = 0;
  for (let i = raw.length - 1; i >= 0; i--) {
    raw[i][2] += carry;
    carry = 0;
    if (raw[i][2] < 0) { carry = raw[i][2]; raw[i][2] = 0; }
  }
  if (carry) raw[0][2] = Math.max(0, raw[0][2] + carry);
  const total = raw.reduce((s, [, , c]) => s + c, 0);
  return raw.map(([key, label, count]) => ({ key, label, count, pct: pct(count, total) }));
}

export function leaderboard(rows) {
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.recruiter) || { recruiter: r.recruiter, intake: 0, offers: 0, applications: 0 };
    g.intake += r.contacted || 0;
    g.offers += r.offers || 0;
    g.applications += r.applications || 0;
    by.set(r.recruiter, g);
  }
  return [...by.values()]
    .map(({ applications, ...g }) => ({ ...g, successRate: pct(g.offers, applications) }))
    .sort((a, b) => b.offers - a.offers || b.intake - a.intake);
}

// Validate 1 dòng nhập funnel. Trả về null nếu hợp lệ, ngược lại là thông
// báo lỗi tiếng Việt. Interviews KHÔNG ràng với Applications (nhiều vòng PV).
export function validateFunnelEntry(v) {
  const fields = [
    ["contacted", "Contacted"], ["responses", "Responses"], ["applications", "Applications"],
    ["interviews", "Interviews"], ["offers", "Offers"], ["hires", "Hires"],
  ];
  for (const [key, label] of fields) {
    const n = v[key];
    if (typeof n !== "number" || Number.isNaN(n)) return `${label}: cần nhập số.`;
    if (n < 0) return `${label}: phải >= 0.`;
    if (!Number.isInteger(n)) return `${label}: phải là số nguyên.`;
  }
  if (v.responses > v.contacted) return "Responses không thể lớn hơn Contacted.";
  if (v.applications > v.responses) return "Applications không thể lớn hơn Responses.";
  if (v.offers > v.interviews) return "Offers không thể lớn hơn Interviews.";
  if (v.hires > v.offers) return "Hires không thể lớn hơn Offers.";
  return null;
}

// Snapshot mới nhất của từng vị trí đang tuyển: gộp mọi recruiter ở tuần
// gần nhất mà vị trí đó có data. status: filled (có hire) / ontrack
// (interviews >= target) / red. stale = tuần đó cũ hơn tuần mới nhất toàn hệ.
export function positionSnapshots(rows, { interviewTarget = 5 } = {}) {
  if (!rows.length) return [];
  const maxWeek = rows.reduce((m, r) => (r.weekEnding > m ? r.weekEnding : m), "");
  const byPos = new Map();
  for (const r of rows) {
    const g = byPos.get(r.position);
    if (!g || r.weekEnding > g.week) byPos.set(r.position, { week: r.weekEnding, rows: [r] });
    else if (r.weekEnding === g.week) g.rows.push(r);
  }
  const order = { red: 0, ontrack: 1, filled: 2 };
  return [...byPos.entries()].map(([position, { week, rows: pr }]) => {
    const t = totals(pr);
    const notes = pr.map((r) => (r.notes || "").trim()).filter(Boolean).join(" · ");
    const status = t.hires > 0 ? "filled" : t.interviews >= interviewTarget ? "ontrack" : "red";
    return {
      position, weekEnding: week, ...t, notes, status,
      gap: status === "red" ? interviewTarget - t.interviews : 0,
      stale: week < maxWeek,
      rates: rates(t),
    };
  }).sort((a, b) => order[a.status] - order[b.status] || b.gap - a.gap);
}

export function monthlyKpi(rows, achievements, month) {
  const mRows = rows.filter((r) => r.weekEnding.startsWith(month));
  const mAch = achievements.filter((a) => a.month === month);
  const recruiters = new Set([...mRows.map((r) => r.recruiter), ...mAch.map((a) => a.recruiter)]);
  return [...recruiters].map((recruiter) => {
    const own = mRows.filter((r) => r.recruiter === recruiter);
    const interviews = own.reduce((s, r) => s + (r.interviews || 0), 0);
    const rto = own.reduce((s, r) => s + (r.offers || 0), 0);
    const interviewsBonus = interviews >= INTERVIEW_TARGET ? INTERVIEW_BONUS : 0;
    const rtoBonus = rto >= RTO_TARGET ? RTO_BONUS : 0;
    const topupBonus = interviewsBonus && rtoBonus ? TOPUP_BONUS : 0;
    const ach = mAch.filter((a) => a.recruiter === recruiter)
      .map((a) => ({ ...a, bonus: KPI_BONUS[a.kpiType] || 0 }));
    const achievementsBonus = ach.reduce((s, a) => s + a.bonus, 0);
    return {
      recruiter, interviews, rto, interviewsBonus, rtoBonus, topupBonus,
      achievements: ach, achievementsBonus,
      totalBonus: interviewsBonus + rtoBonus + topupBonus + achievementsBonus,
    };
  }).sort((a, b) => b.totalBonus - a.totalBonus);
}
