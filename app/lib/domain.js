// Shared by the HR portal, the employee assessment app and the API routes.

export const STATUS = [
  ["invited", "Invited"], ["started", "Assessment started"], ["completed", "Assessment completed"], ["review", "HR review"],
  ["shortlisted", "Shortlisted"], ["interview", "Live interview"], ["selected", "Selected"], ["rejected", "Rejected"], ["hold", "On hold"], ["terminated", "Terminated"],
];
export const SL = Object.fromEntries(STATUS);
export const SUBMITTED = ["completed", "review", "shortlisted", "interview", "selected", "rejected", "hold"];
export const AWAITING = ["completed", "review"];
// Statuses HR sets by hand. The rest (invited, started, completed, terminated) belong to the assessment flow.
export const HR_STATUSES = ["review", "shortlisted", "interview", "selected", "rejected", "hold"];
// Decisions that only make sense once there is a submission to judge.
export const NEEDS_SUBMISSION = ["review", "shortlisted", "interview", "selected"];
export const ROLES = ["HR Admin", "HR Reviewer"];

export const QUESTION_TYPES = ["mcq", "written"];
export const TYPE_NAME = { mcq: "Multiple choice", written: "Written" };

export const DEFAULT_SETTINGS = { mcq: 6, written: 3, selection: "random", timeLimit: 30, resume: true, warnings: 1, onViolation: "terminate", blockMobile: true, wordLimit: 150 };
export const SETTING_LIMITS = { mcq: [1, 20], written: [0, 10], warnings: [0, 3] };
export const SETTING_CHOICES = {
  selection: ["random", "partial", "fixed"], timeLimit: [0, 20, 30, 45], onViolation: ["terminate", "reset", "flag"], wordLimit: [0, 100, 150, 250],
};
export const VIOLATION_TEXT = { terminate: "end your assessment", reset: "reset your assessment and start it again", flag: "flag your assessment for HR review" };

// Keeps only known settings, each clamped to its allowed values; anything else falls back to the default.
export function cleanSettings(input) {
  const s = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const v = input?.[key];
    if (SETTING_LIMITS[key]) { const [mn, mx] = SETTING_LIMITS[key]; if (Number.isInteger(v)) s[key] = Math.max(mn, Math.min(mx, v)); }
    else if (SETTING_CHOICES[key]) { if (SETTING_CHOICES[key].includes(v)) s[key] = v; }
    else if (typeof v === "boolean") s[key] = v;
  }
  return s;
}

export const words = (t) => (String(t || "").trim().match(/\S+/g) || []).length;
export const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
// Local calendar date (YYYY-MM-DD), optionally offset by whole days.
export function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const today = () => localDay();

export function makeToken() {
  const part = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  return `JRS-${part()}-${part()}`;
}
export const makeId = (prefix) => prefix + crypto.randomUUID().slice(0, 8);

/* ---------- drives ---------- */
export const driveExpired = (d) => !!d?.closes && today() > d.closes;
// A drive accepts new attempts, imports and invitations only while it isn't closed or past its close date.
export const driveOpen = (d) => !!d && d.status !== "Closed" && !driveExpired(d);
export const driveStatusLabel = (d) => (d.status !== "Closed" && driveExpired(d) ? "Expired" : d.status);

/* ---------- questions ---------- */
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const usable = (q) => q && QUESTION_TYPES.includes(q.type);

// Draws per the selection rule, ordered by type (multiple choice first).
function buildAssessment(questions, settings) {
  const pick = (type, n) => {
    const pool = questions.filter((q) => q.type === type && q.active);
    if (settings.selection === "fixed") return pool.slice(0, n);
    if (settings.selection === "partial") {
      const head = Math.ceil(n / 2);
      return [...pool.slice(0, head), ...shuffle(pool.slice(head)).slice(0, n - head)];
    }
    return shuffle(pool).slice(0, n);
  };
  return QUESTION_TYPES.flatMap((t) => pick(t, settings[t] || 0)).map((q) => q.id);
}

// An employee either gets questions HR picked when sending the link, or a draw from the assessment rules.
export function planQuestionIds(ws, c, settings = ws.settings) {
  if (!c.questionIds?.length) return buildAssessment(ws.questions, settings);
  const qs = c.questionIds.map((id) => qById(ws, id)).filter(usable);
  return QUESTION_TYPES.flatMap((t) => qs.filter((q) => q.type === t)).map((q) => q.id);
}

export function planCounts(ws, c) {
  if (c.questionIds?.length) {
    const qs = c.questionIds.map((id) => qById(ws, id)).filter(usable);
    return Object.fromEntries(QUESTION_TYPES.map((t) => [t, qs.filter((q) => q.type === t).length]));
  }
  return Object.fromEntries(QUESTION_TYPES.map((t) => [t, Math.min(ws.settings[t] || 0, ws.questions.filter((q) => q.type === t && q.active).length)]));
}

export function publicQuestion(q) {
  const { correct, ...rest } = q;
  return rest;
}

/* ---------- lookups & scoring ---------- */
export const qById = (ws, id) => ws.questions.find((q) => q.id === id);
export const driveOf = (ws, c) => ws.drives.find((d) => d.id === c.driveId) || { name: "—", college: "—", city: "—", status: "Closed" };
export const collegeOf = (ws, c) => c.college || driveOf(ws, c).college;

export function mcqScore(ws, c) {
  return (c.mcq || []).filter((a) => { const q = qById(ws, a.qid); return q && a.chosen === q.correct; }).length;
}

export function writtenAverage(c) {
  const r = Object.values(c.ratings || {});
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

export function stats(ws, list) {
  const by = (s) => list.filter((c) => c.status === s).length;
  const scored = list.filter((c) => c.mcq?.length);
  return {
    invited: list.length, submitted: list.filter((c) => c.submittedAt).length, started: by("started"), notStarted: by("invited"),
    awaiting: by("completed") + by("review"), shortlisted: by("shortlisted") + by("interview") + by("selected"),
    rejected: by("rejected"), hold: by("hold"), terminated: by("terminated"),
    flaggedAwaiting: list.filter((c) => AWAITING.includes(c.status) && c.tabs).length,
    // Percent correct, so employees with different numbers of questions compare fairly.
    avgMcqPct: scored.length ? (scored.reduce((a, c) => a + mcqScore(ws, c) / c.mcq.length, 0) / scored.length) * 100 : null,
  };
}

export function pushStatus(c, to, by) {
  if (c.status === to) return false;
  c.history = [...(c.history || []), { from: c.status, to, by, at: new Date().toISOString() }];
  c.status = to;
  return true;
}

/* ---------- CSV ---------- */
export function toCsv(rows) {
  return rows.map((r) => r.map((v) => {
    v = String(v ?? "");
    // Stop spreadsheet apps from running cell values as formulas.
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(",")).join("\n");
}
