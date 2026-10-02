// Shared by the HR portal, the employee assessment app and the API routes.

export const STATUS = [
  ["invited", "Invited"], ["started", "Assessment started"], ["completed", "Assessment completed"], ["review", "HR review"],
  ["shortlisted", "Shortlisted"], ["interview", "Live interview"], ["selected", "Selected"], ["rejected", "Rejected"], ["hold", "On hold"], ["terminated", "Terminated"],
];
export const SL = Object.fromEntries(STATUS);
export const SUBMITTED = ["completed", "review", "shortlisted", "interview", "selected", "rejected", "hold"];
export const AWAITING = ["completed", "review"];
export const ROLES = ["HR Admin", "HR Reviewer"];

export const DEFAULT_SETTINGS = { mcq: 6, written: 3, video: 1, selection: "random", timeLimit: 30, resume: true, warnings: 1, onViolation: "terminate", blockMobile: true, videoMax: 15, retakes: 1, wordLimit: 150 };
export const SETTING_LIMITS = { mcq: [1, 15], written: [0, 6], video: [0, 2], warnings: [0, 3] };
export const SETTING_CHOICES = {
  selection: ["random", "partial", "fixed"], timeLimit: [0, 20, 30, 45], onViolation: ["terminate", "reset", "flag"],
  videoMax: [10, 15, 20, 30], retakes: [0, 1, 2], wordLimit: [0, 100, 150, 250],
};
export const VIOLATION_TEXT = { terminate: "end your assessment", reset: "reset your assessment and start it again", flag: "flag your assessment for HR review" };

export const words = (t) => (String(t || "").trim().match(/\S+/g) || []).length;
export const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export function makeToken() {
  const part = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  return `JRS-${part()}-${part()}`;
}
export const makeId = (prefix) => prefix + crypto.randomUUID().slice(0, 8);

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Ordered MCQ → written → video, drawn per the selection rule.
export function buildAssessment(questions, settings) {
  const pick = (type, n) => {
    const pool = questions.filter((q) => q.type === type && q.active);
    if (settings.selection === "fixed") return pool.slice(0, n);
    if (settings.selection === "partial") {
      const head = Math.ceil(n / 2);
      return [...pool.slice(0, head), ...shuffle(pool.slice(head)).slice(0, n - head)];
    }
    return shuffle(pool).slice(0, n);
  };
  return [...pick("mcq", settings.mcq), ...pick("written", settings.written), ...pick("video", settings.video)].map((q) => q.id);
}

export const TYPE_ORDER = ["mcq", "written", "video"];

// An employee either gets questions HR picked when sending the link, or a draw from the assessment rules.
export function planQuestionIds(ws, c, settings = ws.settings) {
  if (!c.questionIds?.length) return buildAssessment(ws.questions, settings);
  const qs = c.questionIds.map((id) => ws.questions.find((q) => q.id === id)).filter(Boolean);
  return TYPE_ORDER.flatMap((t) => qs.filter((q) => q.type === t)).map((q) => q.id);
}

export function planCounts(ws, c) {
  if (c.questionIds?.length) {
    const qs = c.questionIds.map((id) => ws.questions.find((q) => q.id === id)).filter(Boolean);
    return Object.fromEntries(TYPE_ORDER.map((t) => [t, qs.filter((q) => q.type === t).length]));
  }
  return Object.fromEntries(TYPE_ORDER.map((t) => [t, Math.min(ws.settings[t], ws.questions.filter((q) => q.type === t && q.active).length)]));
}

export function publicQuestion(q) {
  const { correct, ...rest } = q;
  return rest;
}

export const qById = (ws, id) => ws.questions.find((q) => q.id === id);
export const driveOf = (ws, c) => ws.drives.find((d) => d.id === c.driveId) || { name: "—", college: "—", city: "—" };
export const collegeOf = (ws, c) => c.college || driveOf(ws, c).college;

export function mcqScore(ws, c) {
  return (c.mcq || []).filter((a) => { const q = qById(ws, a.qid); return q && a.chosen === q.correct; }).length;
}

export function writtenAverage(c) {
  const r = Object.entries(c.ratings || {}).filter(([k]) => k !== "video").map(([, v]) => v);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}

export function stats(ws, list) {
  const by = (s) => list.filter((c) => c.status === s).length;
  const scored = list.filter((c) => c.mcq && c.mcq.length);
  return {
    invited: list.length, submitted: list.filter((c) => SUBMITTED.includes(c.status)).length, started: by("started"), notStarted: by("invited"),
    awaiting: by("completed") + by("review"), shortlisted: by("shortlisted") + by("interview") + by("selected"),
    rejected: by("rejected"), hold: by("hold"), terminated: by("terminated"),
    flaggedAwaiting: list.filter((c) => AWAITING.includes(c.status) && c.tabs).length,
    avgMcq: scored.length ? scored.reduce((a, c) => a + mcqScore(ws, c), 0) / scored.length : null,
  };
}

export function pushStatus(c, to, by) {
  if (c.status === to) return false;
  c.history = [...(c.history || []), { from: c.status, to, by, at: new Date().toISOString() }];
  c.status = to;
  return true;
}

export function toCsv(rows) {
  return rows.map((r) => r.map((v) => { v = String(v ?? ""); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");
}

export function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { value += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += ch;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

// Accepts "name, email, phone" lines with or without a header row.
export function parseEmployeeRows(text) {
  let rows = parseCsv(text);
  let ni = 0, ei = 1, pi = 2, ci = -1;
  if (rows.length && !/@/.test(rows[0].join(" "))) {
    const h = rows[0].map((x) => x.toLowerCase().replace(/[^a-z]/g, ""));
    const find = (...names) => h.findIndex((x) => names.includes(x));
    if (find("name", "fullname", "candidatename", "email", "emailaddress") >= 0) {
      ni = find("name", "fullname", "candidatename"); ei = find("email", "emailaddress"); pi = find("phone", "phonenumber", "mobile"); ci = find("college", "school", "university");
      rows = rows.slice(1);
    }
  }
  const valid = [], skipped = [];
  for (const r of rows) {
    const name = r[ni]?.trim(), email = r[ei]?.trim();
    if (name && /^\S+@\S+\.\S+$/.test(email || "")) valid.push({ name, email, phone: pi >= 0 ? r[pi] || "" : "", college: ci >= 0 ? r[ci] || "" : "" });
    else skipped.push(r);
  }
  return { valid, skipped: skipped.length };
}
