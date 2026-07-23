import test from "node:test";
import assert from "node:assert/strict";
import {
  filterRows, totals, rates, outcomeDistribution, leaderboard, monthlyKpi,
  KPI_BONUS, INTERVIEW_TARGET, RTO_TARGET,
} from "../js/metrics.js";

// Dataset cố định: 2 recruiter, 3 tuần (2 tuần tháng 6, 1 tuần tháng 7)
const rows = [
  { weekEnding: "2026-06-21", position: "Java", recruiter: "AnhTD",
    contacted: 25, responses: 20, applications: 15, interviews: 25, offers: 5, hires: 3 },
  { weekEnding: "2026-06-28", position: "QA", recruiter: "AnhTD",
    contacted: 15, responses: 10, applications: 8, interviews: 20, offers: 4, hires: 2 },
  { weekEnding: "2026-07-05", position: "Java", recruiter: "MyLTP",
    contacted: 8, responses: 6, applications: 5, interviews: 4, offers: 2, hires: 1 },
];

const achievements = [
  { month: "2026-06", recruiter: "AnhTD", kpiType: "IT S1/S2 pass probation", title: "Nguyen Van A" },
  { month: "2026-06", recruiter: "AnhTD", kpiType: "Time-to-fill ≤ 30 days", title: "Nguyen Van A" },
  { month: "2026-07", recruiter: "MyLTP", kpiType: "TL S1/S2 pass probation", title: "Tran Thi B" },
];

test("totals aggregates all funnel columns", () => {
  const t = totals(rows);
  assert.deepEqual(t, {
    contacted: 48, responses: 36, applications: 28,
    interviews: 49, offers: 11, hires: 6,
  });
});

test("totals of empty rows is all zeros", () => {
  const t = totals([]);
  assert.deepEqual(t, {
    contacted: 0, responses: 0, applications: 0,
    interviews: 0, offers: 0, hires: 0,
  });
});

test("rates: tỷ lệ chuyển đổi giữa các bậc liên tiếp, 1 decimal", () => {
  const r = rates(totals(rows));
  assert.equal(r.responseRate, 75);      // 36/48
  assert.equal(r.applicationRate, 77.8); // 28/36
  assert.equal(r.interviewRate, 175);    // 49/28 (nhiều vòng phỏng vấn)
  assert.equal(r.offerRate, 22.4);       // 11/49
  assert.equal(r.hireRate, 54.5);        // 6/11
});

test("rates handles division by zero", () => {
  const r = rates(totals([]));
  assert.deepEqual(r, { responseRate: 0, applicationRate: 0, interviewRate: 0, offerRate: 0, hireRate: 0 });
});

test("filterRows by date range and recruiter", () => {
  assert.equal(filterRows(rows, { fromDate: "2026-07-01" }).length, 1);
  assert.equal(filterRows(rows, { toDate: "2026-06-30" }).length, 2);
  assert.equal(filterRows(rows, { recruiter: "AnhTD" }).length, 2);
  assert.equal(filterRows(rows, {}).length, 3);
});

test("outcomeDistribution: 5 nhóm (không có declinedOffer), tổng = contacted trừ offer đang chờ", () => {
  const t = totals(rows);
  const d = outcomeDistribution(t);
  assert.equal(d.length, 5);
  assert.deepEqual(d.map((x) => x.key), [
    "onboarded", "failedInterview", "failedCV", "notApplied", "noResponse",
  ]);
  const sum = d.reduce((s, x) => s + x.count, 0);
  assert.equal(sum, t.contacted - (t.offers - t.hires)); // 48 - 5 = 43
  const onboarded = d.find((x) => x.key === "onboarded");
  assert.equal(onboarded.count, 6);
  assert.equal(onboarded.pct, 14); // 6/43
});

test("outcomeDistribution clamps negative drop-offs to 0", () => {
  // interviews > applications (hợp lệ ngoài đời: nhiều vòng PV) → failedCV không âm
  const d = outcomeDistribution(totals(rows));
  for (const x of d) assert.ok(x.count >= 0, `${x.key} must be >= 0`);
});

test("leaderboard groups by recruiter, sorted by offers desc", () => {
  const lb = leaderboard(rows);
  assert.equal(lb.length, 2);
  assert.equal(lb[0].recruiter, "AnhTD");
  assert.deepEqual(lb[0], { recruiter: "AnhTD", intake: 40, offers: 9, successRate: 39.1 }); // intake 25+15, rate 9/23
  assert.deepEqual(lb[1], { recruiter: "MyLTP", intake: 8, offers: 2, successRate: 40 });    // 2/5
});

test("monthlyKpi: đạt cả 2 target → đủ 3 bonus + achievements", () => {
  const kpi = monthlyKpi(rows, achievements, "2026-06");
  const anh = kpi.find((x) => x.recruiter === "AnhTD");
  assert.equal(anh.interviews, 45);
  assert.equal(anh.rto, 9);
  assert.equal(anh.interviewsBonus, 1000000);
  assert.equal(anh.rtoBonus, 1000000);
  assert.equal(anh.topupBonus, 500000);
  assert.equal(anh.achievements.length, 2);
  assert.equal(anh.achievementsBonus, 3500000); // 3tr + 500k
  assert.equal(anh.totalBonus, 6000000);
});

test("monthlyKpi: không đạt target → bonus 0, vẫn tính achievements", () => {
  const kpi = monthlyKpi(rows, achievements, "2026-07");
  const my = kpi.find((x) => x.recruiter === "MyLTP");
  assert.equal(my.interviews, 4);
  assert.equal(my.rto, 2);
  assert.equal(my.interviewsBonus, 0);
  assert.equal(my.rtoBonus, 0);
  assert.equal(my.topupBonus, 0);
  assert.equal(my.achievementsBonus, 5000000);
  assert.equal(my.totalBonus, 5000000);
});

test("monthlyKpi: chỉ đạt 1 target → không có top-up", () => {
  const rows1 = [{ weekEnding: "2026-05-03", position: "AI", recruiter: "LyPK",
    contacted: 50, responses: 45, applications: 42, interviews: 41, offers: 5, hires: 1 }];
  const kpi = monthlyKpi(rows1, [], "2026-05");
  assert.equal(kpi[0].interviewsBonus, 1000000);
  assert.equal(kpi[0].rtoBonus, 0);
  assert.equal(kpi[0].topupBonus, 0);
});

test("monthlyKpi: tháng không có data → mảng rỗng", () => {
  assert.deepEqual(monthlyKpi(rows, achievements, "2025-01"), []);
});

test("KPI_BONUS has all 7 types with correct amounts", () => {
  assert.equal(Object.keys(KPI_BONUS).length, 7);
  assert.equal(KPI_BONUS["TL S1/S2 pass probation"], 5000000);
  assert.equal(KPI_BONUS["Non-IT pass probation"], 500000);
  assert.equal(INTERVIEW_TARGET, 40);
  assert.equal(RTO_TARGET, 8);
});

// ---- positionSnapshots ----
import { positionSnapshots } from "../js/metrics.js";

const posRows = [
  // Java: 2 recruiter cùng tuần mới nhất → cộng dồn; tuần cũ bị bỏ
  { weekEnding: "2026-07-12", position: "Java", recruiter: "A", contacted: 50, responses: 10, applications: 2, interviews: 1, offers: 0, hires: 0, notes: "note cũ" },
  { weekEnding: "2026-07-19", position: "Java", recruiter: "A", contacted: 60, responses: 13, applications: 2, interviews: 1, offers: 0, hires: 0, notes: "Ready to offer" },
  { weekEnding: "2026-07-19", position: "Java", recruiter: "B", contacted: 40, responses: 10, applications: 2, interviews: 1, offers: 0, hires: 0, notes: "" },
  // DevOps: chỉ có tuần cũ → stale, đạt target
  { weekEnding: "2026-07-05", position: "DevOps", recruiter: "A", contacted: 45, responses: 28, applications: 7, interviews: 6, offers: 2, hires: 0, notes: "Pending offer" },
  // AI: có hire → filled
  { weekEnding: "2026-07-19", position: "AI", recruiter: "B", contacted: 5, responses: 3, applications: 2, interviews: 2, offers: 1, hires: 1, notes: "Offer accepted" },
];

test("positionSnapshots: gộp theo vị trí ở tuần mới nhất của vị trí đó", () => {
  const snaps = positionSnapshots(posRows, { interviewTarget: 5 });
  const java = snaps.find((s) => s.position === "Java");
  assert.equal(java.weekEnding, "2026-07-19");
  assert.equal(java.contacted, 100);
  assert.equal(java.interviews, 2);
  assert.equal(java.status, "red");
  assert.equal(java.gap, 3);           // 5 - 2
  assert.equal(java.stale, false);
  assert.equal(java.notes, "Ready to offer");
});

test("positionSnapshots: status ontrack/filled + stale khi tuần cũ hơn max", () => {
  const snaps = positionSnapshots(posRows, { interviewTarget: 5 });
  const devops = snaps.find((s) => s.position === "DevOps");
  assert.equal(devops.status, "ontrack"); // 6 >= 5
  assert.equal(devops.stale, true);       // 05/07 < 19/07
  const ai = snaps.find((s) => s.position === "AI");
  assert.equal(ai.status, "filled");
});

test("positionSnapshots: sort red (gap lớn nhất trước) → ontrack → filled", () => {
  const snaps = positionSnapshots(posRows, { interviewTarget: 5 });
  assert.deepEqual(snaps.map((s) => s.status), ["red", "ontrack", "filled"]);
});

test("positionSnapshots: rỗng → mảng rỗng", () => {
  assert.deepEqual(positionSnapshots([], { interviewTarget: 5 }), []);
});

// ---- validateFunnelEntry ----
import { validateFunnelEntry } from "../js/metrics.js";

test("validateFunnelEntry: hợp lệ → null", () => {
  assert.equal(validateFunnelEntry({ contacted: 10, responses: 8, applications: 5, interviews: 7, offers: 2, hires: 1 }), null);
});

test("validateFunnelEntry: bắt lỗi thứ tự funnel và số âm/lẻ", () => {
  assert.match(validateFunnelEntry({ contacted: 5, responses: 8, applications: 5, interviews: 1, offers: 0, hires: 0 }), /Responses/);
  assert.match(validateFunnelEntry({ contacted: 10, responses: 8, applications: 9, interviews: 1, offers: 0, hires: 0 }), /Applications/);
  assert.match(validateFunnelEntry({ contacted: 10, responses: 8, applications: 5, interviews: 2, offers: 3, hires: 0 }), /Offers/);
  assert.match(validateFunnelEntry({ contacted: 10, responses: 8, applications: 5, interviews: 2, offers: 2, hires: 3 }), /Hires/);
  assert.match(validateFunnelEntry({ contacted: -1, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0 }), />= 0/);
  assert.match(validateFunnelEntry({ contacted: 1.5, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0 }), /nguyên/);
});

// ---- stackFromTitle + rtoBenchmark (Azure Board) ----
import { stackFromTitle, rtoBenchmark, positionForTitle } from "../js/metrics.js";

test("stackFromTitle: parse tech stack từ title thật trên board", () => {
  const cases = [
    ["M1 BA (EN 6.0) / TO - Nguyen Phan Vu - Interview date: 14/7/2026", "BA"],
    ["M2/S1 Java (EN 6.0)  / TO", "Java"],
    ["M1/M2 BA (EN 6.0) / TO", "BA"],
    ["S1/S2 C#/Java TL (EN 6.0) / TO", "C#/Java TL"],
    ["M1 DevOps (EN 7.0) / SU - Nguyen Trinh Vu - Interview: 9/7", "DevOps"],
    ["M1 Comtor (JP N1) / SU", "Comtor"],
    ["M1+ BE Web (EN 7.0) / Đào Thành Lộc Interview date: 04/08", "BE Web"],
    ["S1 GET BDM (Ger) / TO", "GET BDM"],
    ["FTE J2 AI (EN 5.0) / TO - Tran Minh Hiep - OB: 28/7/26", "AI"],
    ["VB Growth Assistant (EN 6.0) / BD", "VB Growth Assistant"],
    ["M1 Java (EN Toeic 770) / SU - Ngo Duc Nam", "Java"],
  ];
  for (const [title, expected] of cases) {
    assert.equal(stackFromTitle(title), expected, title);
  }
});

test("positionForTitle: match title vào position qua tên + alias, ưu tiên token dài", () => {
  const aliases = { "Backend Web": ["BE Web", "BE"], "Frontend Web": ["FE Web", "FE", "Frontend"] };
  const positions = ["Java", "Backend Web", "Frontend Web", "BA", "AI", "DevOps", "GET", "QA"];
  const cases = [
    ["M1 Java (EN 6.0) / SU - A", "Java"],
    ["S1/S2 C#/Java TL (EN 6.0) / TO", "Java"],
    ["M1+ BE Web (EN 7.0) / X", "Backend Web"],
    ["M1/M2 Frontend (EN 5.0) / PF", "Frontend Web"],
    ["FTE J2 AI (EN 5.0) / TO - B", "AI"],
    ["M1 BA (EN 6.0) / TO - C", "BA"],
    ["S1 GET BDM (Ger) / TO", "GET"],
    ["M2 DevOps (EN 5.0) / SU", "DevOps"],
    ["VB Growth Assistant (EN 6.0) / BD", null], // không khớp position nào
  ];
  for (const [title, expected] of cases) {
    assert.equal(positionForTitle(title, positions, aliases), expected, title);
  }
});

test("rtoBenchmark: mọi active stack đều có hàng (kể cả 0 RTO), unmatched vào Khác", () => {
  const rtoItems = [
    { title: "M1 Java (EN 6.0) / SU - A", recruiter: "Thuy" },
    { title: "S1/S2 C#/Java TL / TO - B", recruiter: "Thu" },
    { title: "M1 BA (EN 6.0) / TO - C", recruiter: "Trang" },
    { title: "VB Growth Assistant / BD - D", recruiter: "An" },
  ];
  const b = rtoBenchmark(rtoItems, { activeStacks: ["Java", "BA", "DevOps"], aliases: {}, min: 4 });
  assert.deepEqual(b.map((x) => [x.stack, x.rto, x.gap]), [
    ["DevOps", 0, 4],   // 0 RTO vẫn hiện, thiếu nhiều nhất trước
    ["BA", 1, 3],
    ["Java", 2, 2],
    ["Khác", 1, 0],     // unmatched, không có target, xếp cuối
  ]);
  assert.equal(b[3].noTarget, true);
});

test("rtoBenchmark: activeStacks rỗng → mảng rỗng (UI hiện hướng dẫn)", () => {
  assert.deepEqual(rtoBenchmark([{ title: "M1 Java / TO - A" }], { activeStacks: [], aliases: {}, min: 4 }), []);
});
