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

test("monthlyKpi + rtoItems: đếm theo rtoDate trong tháng (flow), status không ảnh hưởng", () => {
  const items = [
    { name: "A", recruiter: "AnhTD", rtoDate: "2026-06-05", status: "Ready" },
    { name: "B", recruiter: "AnhTD", rtoDate: "2026-06-20", status: "Hired" },   // đã hire vẫn tính cho tháng 6
    { name: "C", recruiter: "MyLTP", rtoDate: "2026-06-11", status: "Rejected" },
    { name: "D", recruiter: "AnhTD", rtoDate: "2026-07-01", status: "Ready" },   // tháng khác → không tính
    { name: "E", rtoDate: "2026-06-12", status: "Ready" },                        // không có recruiter → bỏ qua
  ];
  const kpi = monthlyKpi(rows, achievements, "2026-06", { rtoItems: items });
  const anh = kpi.find((x) => x.recruiter === "AnhTD");
  assert.equal(anh.rto, 2); // từ log, không phải 9 offers của funnel
  assert.equal(anh.rtoLive, true);
  assert.equal(anh.rtoBonus, 0); // 2 < 8
  assert.equal(anh.topupBonus, 0); // mất top-up vì RTO chưa đạt
});

test("monthlyKpi + rtoItems: recruiter chỉ có trong log RTO vẫn có hàng", () => {
  const items = [{ name: "X", recruiter: "NewGuy", rtoDate: "2026-06-09", status: "Ready" }];
  const kpi = monthlyKpi(rows, achievements, "2026-06", { rtoItems: items });
  const ng = kpi.find((x) => x.recruiter === "NewGuy");
  assert.ok(ng);
  assert.equal(ng.rto, 1);
  assert.equal(ng.interviews, 0);
});

test("KPI_BONUS has all 7 types with correct amounts", () => {
  assert.equal(Object.keys(KPI_BONUS).length, 7);
  assert.equal(KPI_BONUS["TL S1/S2 pass probation"], 5000000);
  assert.equal(KPI_BONUS["Non-IT pass probation"], 500000);
  assert.equal(INTERVIEW_TARGET, 40);
  assert.equal(RTO_TARGET, 8);
});

// ---- weekKey ----
import { weekKey } from "../js/metrics.js";

test("weekKey: trả về thứ Hai đầu tuần ISO", () => {
  assert.equal(weekKey("2026-07-19"), "2026-07-13"); // Chủ nhật → thứ Hai cùng tuần
  assert.equal(weekKey("2026-07-13"), "2026-07-13"); // thứ Hai giữ nguyên
  assert.equal(weekKey("2026-07-15"), "2026-07-13"); // thứ Tư
  assert.equal(weekKey("2026-07-20"), "2026-07-20"); // thứ Hai tuần sau
});

// ---- positionSnapshots ----
import { positionSnapshots } from "../js/metrics.js";

const posRows = [
  // Java: 2 tuần, 2 recruiter → cộng dồn TẤT CẢ; target = 5 × 2 tuần
  { weekEnding: "2026-07-12", position: "Java", recruiter: "A", contacted: 50, responses: 10, applications: 2, interviews: 1, offers: 0, hires: 0, notes: "note cũ" },
  { weekEnding: "2026-07-19", position: "Java", recruiter: "A", contacted: 60, responses: 13, applications: 2, interviews: 1, offers: 0, hires: 0, notes: "Ready to offer" },
  { weekEnding: "2026-07-19", position: "Java", recruiter: "B", contacted: 40, responses: 10, applications: 2, interviews: 1, offers: 0, hires: 0, notes: "" },
  // DevOps: chỉ có tuần cũ → stale, đạt target (6 >= 5×1)
  { weekEnding: "2026-07-05", position: "DevOps", recruiter: "A", contacted: 45, responses: 28, applications: 7, interviews: 6, offers: 2, hires: 0, notes: "Pending offer" },
  // AI: có hire → filled
  { weekEnding: "2026-07-19", position: "AI", recruiter: "B", contacted: 5, responses: 3, applications: 2, interviews: 2, offers: 1, hires: 1, notes: "Offer accepted" },
];

test("positionSnapshots: cộng dồn mọi tuần trong khoảng, target × số tuần", () => {
  const snaps = positionSnapshots(posRows, { interviewTarget: 5 });
  const java = snaps.find((s) => s.position === "Java");
  assert.equal(java.weekEnding, "2026-07-19"); // tuần mới nhất
  assert.equal(java.weeks, 2);
  assert.equal(java.contacted, 150);   // 50 + 60 + 40
  assert.equal(java.interviews, 3);    // 1 + 1 + 1
  assert.equal(java.target, 10);       // 5 × 2 tuần
  assert.equal(java.status, "red");
  assert.equal(java.gap, 7);           // 10 - 3
  assert.equal(java.stale, false);
  assert.equal(java.notes, "Ready to offer"); // chỉ notes tuần mới nhất
});

test("positionSnapshots: lọc bớt tuần thì số cộng dồn thay đổi theo", () => {
  const recent = posRows.filter((r) => r.weekEnding >= "2026-07-19");
  const java = positionSnapshots(recent, { interviewTarget: 5 })
    .find((s) => s.position === "Java");
  assert.equal(java.weeks, 1);
  assert.equal(java.contacted, 100); // chỉ còn tuần 19/07
  assert.equal(java.target, 5);
});

test("positionSnapshots: log theo NGÀY — nhiều ngày cùng tuần ISO = 1 tuần", () => {
  const daily = [
    { weekEnding: "2026-07-14", position: "QA", recruiter: "A", contacted: 10, responses: 3, applications: 1, interviews: 2, offers: 0, hires: 0, notes: "" },
    { weekEnding: "2026-07-16", position: "QA", recruiter: "A", contacted: 8, responses: 2, applications: 1, interviews: 3, offers: 1, hires: 0, notes: "chờ offer" },
    { weekEnding: "2026-07-21", position: "QA", recruiter: "A", contacted: 5, responses: 1, applications: 0, interviews: 1, offers: 0, hires: 0, notes: "" },
  ];
  const qa = positionSnapshots(daily, { interviewTarget: 5 })[0];
  assert.equal(qa.weeks, 2);       // 14+16/7 cùng tuần ISO, 21/7 tuần sau
  assert.equal(qa.target, 10);     // 5 × 2 tuần
  assert.equal(qa.contacted, 23);
  assert.equal(qa.interviews, 6);
  assert.equal(qa.weekEnding, "2026-07-21"); // ngày log mới nhất
  assert.equal(qa.stale, false);
  assert.equal(qa.notes, "");      // notes chỉ của ngày mới nhất
});

test("positionSnapshots: stale theo tuần ISO chứ không theo ngày", () => {
  const daily = [
    { weekEnding: "2026-07-15", position: "BA", recruiter: "A", contacted: 1, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0, notes: "" },
    { weekEnding: "2026-07-17", position: "AI", recruiter: "A", contacted: 1, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0, notes: "" },
    { weekEnding: "2026-07-08", position: "GET", recruiter: "A", contacted: 1, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0, notes: "" },
  ];
  const snaps = positionSnapshots(daily, { interviewTarget: 5 });
  // BA log 15/7, AI log 17/7 — cùng tuần ISO với ngày mới nhất → không stale.
  assert.equal(snaps.find((s) => s.position === "BA").stale, false);
  assert.equal(snaps.find((s) => s.position === "AI").stale, false);
  assert.equal(snaps.find((s) => s.position === "GET").stale, true); // tuần trước
});

test("positionSnapshots: status ontrack/filled + stale khi tuần cũ hơn max", () => {
  const snaps = positionSnapshots(posRows, { interviewTarget: 5 });
  const devops = snaps.find((s) => s.position === "DevOps");
  assert.equal(devops.status, "ontrack"); // 6 >= 5×1
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

test("validateFunnelEntry: bắt số âm/lẻ/không phải số", () => {
  assert.match(validateFunnelEntry({ contacted: -1, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0 }), />= 0/);
  assert.match(validateFunnelEntry({ contacted: 1.5, responses: 0, applications: 0, interviews: 0, offers: 0, hires: 0 }), /nguyên/);
  assert.match(validateFunnelEntry({ contacted: 1, responses: NaN, applications: 0, interviews: 0, offers: 0, hires: 0 }), /số/);
});

test("validateFunnelEntry: KHÔNG ràng thứ tự stage — flow lệch tuần hợp lệ", () => {
  // Tuần chỉ có offer cho ứng viên đã interview tuần trước: Offers > Interviews vẫn OK.
  assert.equal(validateFunnelEntry({ contacted: 0, responses: 0, applications: 0, interviews: 0, offers: 2, hires: 0 }), null);
  // Hire tuần này từ offer tuần trước.
  assert.equal(validateFunnelEntry({ contacted: 10, responses: 8, applications: 5, interviews: 2, offers: 0, hires: 1 }), null);
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

test("rtoBenchmark: mọi active stack đều có hàng (kể cả 0 RTO), position ngoài active vào Khác", () => {
  const rtoItems = [
    { name: "A", position: "Java", recruiter: "Thuy" },
    { name: "B", position: "Java", recruiter: "Thu" },
    { name: "C", position: "BA", recruiter: "Trang" },
    { name: "D", position: "MKT", recruiter: "An" }, // MKT không active
  ];
  const b = rtoBenchmark(rtoItems, { activeStacks: ["Java", "BA", "DevOps"], min: 4 });
  assert.deepEqual(b.map((x) => [x.stack, x.rto, x.gap]), [
    ["DevOps", 0, 4],   // 0 RTO vẫn hiện, thiếu nhiều nhất trước
    ["BA", 1, 3],
    ["Java", 2, 2],
    ["Khác", 1, 0],     // ngoài active, không có target, xếp cuối
  ]);
  assert.equal(b[3].noTarget, true);
  assert.equal(b[2].candidates[0].name, "A"); // giữ nguyên item để UI vẽ card
});

test("rtoBenchmark: activeStacks rỗng → mảng rỗng (UI hiện hướng dẫn)", () => {
  assert.deepEqual(rtoBenchmark([{ name: "A", position: "Java" }], { activeStacks: [], min: 4 }), []);
});

// ---- parseCandidateTicket (Log RTO — dán từ Teams) ----
import { parseCandidateTicket } from "../js/entry.js";

test("parseCandidateTicket: parse bảng Candidate Info copy từ Teams", () => {
  const pasted = [
    "CANDIDATE TICKET | PENDING OFFER DECISION",
    "CANDIDATE",
    "Name\tNguyen Van X",
    "Position\tFrontend Developer",
    "Technical Level\tM2",
    "ENG Score (ELSA)\t7.0",
    "Source\tHRHunt - An Nguyen",
    "Profile Link\t[ Link ]",
    "INTERVIEW SUMMARY",
    "Interview Date\t",
    "Round\t1 / ?",
    "Interviewed By\t",
    "Overall Assessment\t",
    "OFFER INPUTS",
    "Expected Salary\t37-38M Gross",
    "Benchmark (Member 1)\t",
    "Project Budget\t",
    "Possible Joining Date\t~1 tháng",
    "Potential Project\t",
  ].join("\n");
  const p = parseCandidateTicket(pasted);
  assert.equal(p.name, "Nguyen Van X");
  assert.equal(p.position, "Frontend Developer");
  assert.equal(p.level, "M2");
  assert.equal(p.eng, "7.0");
  assert.equal(p.source, "HRHunt - An Nguyen");
  assert.equal(p.round, "1 / ?");
  assert.equal(p.joiningDate, "~1 tháng");
  assert.equal(p.expectedSalary, undefined); // nhóm lương không được parse
  assert.equal(p.interviewDate, undefined);  // ô trống → không set
});
