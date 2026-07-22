// Data mẫu (deterministic — LCG seed cố định) để duyệt giao diện khi chưa
// nối SharePoint. 5 recruiter × 26 tuần, số liệu luôn hợp lệ theo funnel.

const RECRUITERS = ["AnhTD", "MyLTP", "LyPK", "DucPM", "VietBN"];
const POSITIONS = ["Java", "Frontend Web", "Backend Web", "AI", "DevOps", "BA", "QA", "PM", "UI/UX", "Comtor"];
const LAST_SUNDAY = "2026-07-19";
const WEEKS = 26;

let seed = 42;
function rnd() { // LCG — ổn định giữa các lần chạy
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const ri = (min, max) => min + Math.floor(rnd() * (max - min + 1));

function isoAddDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export const DEMO_FUNNEL = [];
for (let w = WEEKS - 1; w >= 0; w--) {
  const weekEnding = isoAddDays(LAST_SUNDAY, -7 * w);
  for (const recruiter of RECRUITERS) {
    // mỗi recruiter phụ trách 1-2 vị trí/tuần
    const n = ri(1, 2);
    for (let i = 0; i < n; i++) {
      const contacted = ri(4, 18);
      const responses = ri(Math.floor(contacted * 0.5), contacted);
      const applications = ri(Math.floor(responses * 0.5), responses);
      // interviews có thể vượt applications (nhiều vòng phỏng vấn)
      const interviews = ri(Math.floor(applications * 0.6), Math.floor(applications * 1.4));
      const offers = ri(0, Math.min(interviews, Math.max(1, Math.floor(applications * 0.35))));
      const hires = ri(0, offers);
      DEMO_FUNNEL.push({
        weekEnding, recruiter,
        position: POSITIONS[ri(0, POSITIONS.length - 1)],
        contacted, responses, applications, interviews, offers, hires,
      });
    }
  }
}

// Ghi chú mẫu cho tuần mới nhất (hiện ở section Open Positions)
const DEMO_NOTES = { "Java": "Ready to offer 2 bạn M1.", "DevOps": "Pending 2 PV + 2 offer.", "QA": "Tuần sau phỏng vấn." };
for (const r of DEMO_FUNNEL) {
  if (r.weekEnding === LAST_SUNDAY && DEMO_NOTES[r.position]) {
    r.notes = DEMO_NOTES[r.position];
    delete DEMO_NOTES[r.position];
  }
}

export const DEMO_ACHIEVEMENTS = [
  { month: "2026-07", recruiter: "AnhTD", kpiType: "IT S1/S2 pass probation", title: "Senior Java Dev" },
  { month: "2026-07", recruiter: "MyLTP", kpiType: "Time-to-fill ≤ 30 days", title: "QA Engineer" },
  { month: "2026-06", recruiter: "AnhTD", kpiType: "TL S1/S2 pass probation", title: "Team Lead .NET" },
  { month: "2026-06", recruiter: "LyPK", kpiType: "IT M1/M2 pass probation", title: "Middle BA" },
  { month: "2026-06", recruiter: "DucPM", kpiType: "Non-IT pass probation", title: "MKT Executive" },
  { month: "2026-05", recruiter: "VietBN", kpiType: "IT J1/J2 pass probation", title: "Junior Frontend" },
  { month: "2026-05", recruiter: "MyLTP", kpiType: "IT M/S service contract cycle", title: "DevOps part-time" },
];
