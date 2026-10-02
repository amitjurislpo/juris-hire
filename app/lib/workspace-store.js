import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { DEFAULT_SETTINGS, makeId, makeToken } from "./domain";
import { hashPassword } from "./password";

const { Pool } = pg;
const VERSION = 2;

const dataDirectory = path.join(process.cwd(), "data");
const workspacePath = path.join(dataDirectory, "workspace.json");
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined }) : null;
let databaseReady;

async function ensureDatabase() {
  if (!pool) return false;
  databaseReady ||= pool.query("CREATE TABLE IF NOT EXISTS workspace_state (id integer PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  await databaseReady;
  return true;
}

const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60000).toISOString();
const shift = (at, ms) => new Date(new Date(at).getTime() + ms).toISOString();
let seq = 0;
const eid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

const questionBank = [
  { id: "q1", type: "mcq", cat: "Sales judgement", active: true, text: "A prospective client says your proposal is “too expensive”. What is the best first response?", options: ["Offer an immediate discount to keep the deal moving", "Ask what they are comparing it with to understand the concern", "Explain that the price is fixed and cannot change", "Move on and follow up with them next quarter"], correct: 1 },
  { id: "q2", type: "mcq", cat: "Numerical", active: true, text: "A service costs ₹1,200 and is offered at 15% off. What is the discounted price?", options: ["₹1,020", "₹1,050", "₹1,080", "₹1,000"], correct: 0 },
  { id: "q3", type: "mcq", cat: "Communication", active: true, text: "Which of these is the best open-ended question to ask early in a sales conversation?", options: ["Are you happy with your current provider?", "What would an ideal outcome look like for your team?", "Would you like a demo on Monday?", "Is your budget already approved?"], correct: 1 },
  { id: "q4", type: "mcq", cat: "Numerical", active: true, text: "You have 40 leads and convert 15% of them. How many new customers is that?", options: ["4", "6", "8", "15"], correct: 1 },
  { id: "q5", type: "mcq", cat: "Business awareness", active: true, text: "In sales, what does a “pipeline” usually refer to?", options: ["The list of products a company sells", "Prospective deals at different stages of progress", "The company’s supply chain", "The annual marketing budget"], correct: 1 },
  { id: "q6", type: "mcq", cat: "Sales judgement", active: true, text: "A client hasn’t replied to two follow-up emails. What is the most professional next step?", options: ["Stop contacting them", "Send a short note offering a call at a time that suits them", "Escalate to their manager", "Send a reminder every day"], correct: 1 },
  { id: "q7", type: "mcq", cat: "Business awareness", active: true, text: "Which metric best shows how many prospects become paying customers?", options: ["Conversion rate", "Bounce rate", "Churn rate", "Click-through rate"], correct: 0 },
  { id: "q8", type: "mcq", cat: "Numerical", active: true, text: "If you meet 3 clients a day, 5 days a week, how many meetings is that in 4 weeks?", options: ["45", "60", "75", "80"], correct: 1 },
  { id: "q9", type: "mcq", cat: "Communication", active: true, text: "What is the main purpose of a discovery call?", options: ["To close the deal quickly", "To understand the client’s needs and situation", "To negotiate the final price", "To send the contract"], correct: 1 },
  { id: "q10", type: "mcq", cat: "Sales judgement", active: false, text: "A complaint arrives late on a Friday. What should happen first?", options: ["Wait until Monday", "Acknowledge it promptly and set a clear expectation", "Forward it without reading", "Offer a refund immediately"], correct: 1 },
  { id: "w1", type: "written", cat: "Situational", active: true, text: "A client tells you your service is too expensive. How would you respond?" },
  { id: "w2", type: "written", cat: "Communication", active: true, text: "Describe a time you convinced someone to change their mind. What did you do?" },
  { id: "w3", type: "written", cat: "Reasoning", active: true, text: "How would you plan your first week if you were given a new sales territory?" },
  { id: "w4", type: "written", cat: "Situational", active: true, text: "A client is unhappy about a delay that was not your fault. What would you say to them?" },
  { id: "w5", type: "written", cat: "Communication", active: false, text: "What makes someone good at building long-term client relationships?" },
  { id: "v1", type: "video", cat: "Verbal communication", active: true, text: "In 15 seconds, tell us why you would do well in a client-facing sales role." },
  { id: "v2", type: "video", cat: "Verbal communication", active: true, text: "In 15 seconds, introduce yourself the way you would to a new client." },
];

const sampleWritten = {
  w1: "I would first ask what they are comparing us with, so I understand the real concern. Then I would walk through the outcomes they get for the price and, if it fits, suggest a smaller starting scope.",
  w2: "During our college fest I persuaded the committee to move sponsor outreach online. I shared last year’s response numbers and offered to run a two-week trial myself, which raised more than the year before.",
  w3: "List existing accounts, meet the top five in person, and note which ones have renewals coming up so I can prioritise follow-ups. I would also ask my manager which accounts need attention first.",
  w4: "I would apologise for the inconvenience without blaming anyone, explain what caused the delay, give a clear new date, and check in before that date so they are not left waiting.",
};

function makeSeedWorkspace() {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const drives = [
    { id: "d1", name: "Sales Associate · Batch 1", college: "St. Xavier's College", city: "Mumbai", date: day(-4), closes: day(4), status: "Active" },
    { id: "d2", name: "Sales Associate · Batch 2", college: "Mithibai College", city: "Mumbai", date: day(-2), closes: day(6), status: "Active" },
    { id: "d3", name: "Business Development Trainee", college: "NM College", city: "Mumbai", date: day(-1), closes: day(8), status: "Active" },
    { id: "d4", name: "Sales Associate · Pilot", college: "Jai Hind College", city: "Mumbai", date: day(-22), closes: day(-14), status: "Closed" },
  ];
  // HR accounts come from ensureAdmin() and Users & roles; no sample logins.
  const users = [];
  // name, drive, status, mcqScore, tabSwitches, minutesAgo
  const rows = [
    ["Ananya Rao", "d1", "review", 5, 1, 64], ["Karan Mehta", "d1", "completed", 6, 0, 81], ["Sara Fernandes", "d2", "review", 4, 2, 165],
    ["Rohan Iyer", "d2", "completed", 5, 0, 1310], ["Neha Kapoor", "d3", "completed", 3, 0, 1400], ["Vikram Singh", "d1", "shortlisted", 6, 0, 1500],
    ["Priya Nair", "d1", "interview", 5, 0, 2900], ["Arjun Malhotra", "d2", "rejected", 2, 0, 2950], ["Ishita Banerjee", "d2", "shortlisted", 5, 0, 1700],
    ["Kabir Khan", "d3", "hold", 4, 1, 1250], ["Meghna Joshi", "d3", "review", 5, 0, 300], ["Rahul Verma", "d1", "started", null, 0, 18],
    ["Tanvi Kulkarni", "d2", "invited", null, 0, 0], ["Siddharth Rao", "d3", "invited", null, 0, 0], ["Zara Sheikh", "d1", "invited", null, 0, 0],
    ["Nikhil Gupta", "d2", "terminated", null, 2, 420], ["Aisha Thomas", "d4", "selected", 6, 0, 30000], ["Dev Patel", "d4", "rejected", 3, 0, 30100],
    ["Pooja Reddy", "d4", "selected", 5, 0, 30200], ["Yash Agarwal", "d3", "started", null, 1, 9], ["Riya Sen", "d1", "completed", 4, 0, 240],
  ];
  const mcqPool = questionBank.filter((q) => q.type === "mcq" && q.active);
  const wPool = ["w1", "w2", "w3", "w4"];
  const events = [];
  const candidates = rows.map(([name, driveId, status, score, tabs, m], i) => {
    const [first, last] = name.toLowerCase().split(" ");
    const c = { id: `c${i + 1}`, name, email: `${first}.${last[0]}@example.edu`, phone: "", driveId, status, token: makeToken(), invitedAt: iso(m + 2880), history: [], notes: [], ratings: {}, tabs: 0, sample: true };
    c.history.push({ from: null, to: "invited", by: "Meera Nair", at: c.invitedAt });
    if (status !== "invited") {
      const start = iso(m + 20);
      c.startedAt = start; c.device = i % 3 === 0 ? "Desktop · Edge" : "Desktop · Chrome"; c.tabs = tabs;
      events.push({ id: eid(), cid: c.id, at: shift(start, -40000), type: "eligible", text: `Eligibility check passed · ${c.device}` });
      events.push({ id: eid(), cid: c.id, at: start, type: "start", text: "Assessment started" });
      c.history.push({ from: "invited", to: "started", by: "System", at: start });
      for (let t = 0; t < tabs; t++) events.push({ id: eid(), cid: c.id, at: shift(start, (6 + t * 4) * 60000), type: "tab", text: `Tab hidden ${4 + t * 3}s · ${t === 0 ? "warning shown" : "violation rule applied"}`, warn: true });
    }
    if (score !== null) {
      const sub = iso(m);
      c.submittedAt = sub; c.duration = 14 + (i % 9);
      const qs = [...mcqPool.slice(i % 3), ...mcqPool].slice(0, 6);
      c.mcq = qs.map((q, k) => ({ qid: q.id, chosen: k < score ? q.correct : (q.correct + 1) % 4 }));
      const ws = [wPool[i % 4], wPool[(i + 1) % 4], wPool[(i + 2) % 4]];
      c.written = ws.map((id) => ({ qid: id, text: sampleWritten[id] }));
      c.videoQ = i % 2 ? "v2" : "v1"; c.videoDur = 11 + (i % 5); c.hasVideo = false;
      events.push({ id: eid(), cid: c.id, at: shift(sub, -50000), type: "video", text: `Video recorded · ${c.videoDur}s` });
      events.push({ id: eid(), cid: c.id, at: sub, type: "submit", text: "Assessment submitted" });
      c.history.push({ from: "started", to: "completed", by: "System", at: sub });
      const chain = { review: ["review"], shortlisted: ["review", "shortlisted"], interview: ["review", "shortlisted", "interview"], rejected: ["review", "rejected"], hold: ["review", "hold"], selected: ["review", "shortlisted", "interview", "selected"] }[status] || [];
      let prev = "completed";
      chain.forEach((s, k) => { c.history.push({ from: prev, to: s, by: k % 2 ? "Arjun Desai" : "Meera Nair", at: shift(sub, (k + 1) * 30 * 60000) }); prev = s; });
      if (["shortlisted", "interview", "selected"].includes(status)) c.ratings = { [ws[0]]: 4, [ws[1]]: 4, [ws[2]]: 5, video: 4 };
      if (status === "rejected") c.ratings = { [ws[0]]: 2, [ws[1]]: 2, video: 2 };
    }
    if (status === "terminated") {
      const t = iso(m);
      c.history.push({ from: "started", to: "terminated", by: "System", at: t });
      events.push({ id: eid(), cid: c.id, at: t, type: "terminated", text: "Assessment terminated after repeated tab switches", warn: true });
    }
    return c;
  });
  events.push({ id: eid(), cid: "c16", at: iso(700), type: "device", text: "Blocked: opened on mobile (Android)", warn: true });
  events.push({ id: eid(), cid: "c4", at: iso(1330), type: "reconnect", text: "Page refreshed · state restored" });
  return { version: VERSION, settings: { ...DEFAULT_SETTINGS }, drives, questions: questionBank, users, candidates, events };
}

// Upgrades the v1 workspace (label statuses, correctIndex, inviteToken) without losing data.
const V1_STATUS = { "Invited": "invited", "Assessment Started": "started", "Assessment Completed": "completed", "HR Review": "review", "Shortlisted": "shortlisted", "Interview": "interview", "Selected": "selected", "Rejected": "rejected", "On Hold": "hold", "Assessment Terminated": "terminated" };
function migrate(ws) {
  if (ws.version === VERSION) return ws;
  const seed = makeSeedWorkspace();
  const addWeek = (d) => { const x = new Date(d || Date.now()); x.setDate(x.getDate() + 7); return x.toISOString().slice(0, 10); };
  const questions = (ws.questions || []).map(({ category, correctIndex, ...q }) => ({ ...q, cat: q.cat || category || "General", ...(q.type === "mcq" ? { correct: q.correct ?? correctIndex ?? 0 } : {}) }));
  const events = [];
  const candidates = (ws.candidates || []).map((o) => {
    const status = V1_STATUS[o.status] || o.status || "invited";
    const qs = (o.questionIds || []).map((id) => questions.find((q) => q.id === id)).filter(Boolean);
    const r = o.responses || {};
    (o.activityEvents || []).forEach((e) => events.push({ id: eid(), cid: o.id, at: e.at, type: "tab", text: "Tab hidden · recorded", warn: true }));
    const c = {
      id: o.id, name: o.name, email: o.email, phone: o.phone || "", college: o.college || "", driveId: o.driveId, status, token: o.inviteToken || makeToken(),
      invitedAt: o.createdAt || new Date().toISOString(), history: (o.statusHistory || []).map((h) => ({ ...h, from: V1_STATUS[h.from] || h.from, to: V1_STATUS[h.to] || h.to })),
      notes: o.evaluation?.notes ? [{ text: o.evaluation.notes, by: o.evaluation.evaluatedBy || "HR", at: o.evaluation.evaluatedAt }] : [], ratings: {}, tabs: o.flags || 0,
      startedAt: o.startedAt, submittedAt: o.completedAt,
    };
    if (!c.history.length) c.history.push({ from: null, to: status, by: "System", at: c.invitedAt });
    if (o.completedAt) {
      c.mcq = qs.filter((q) => q.type === "mcq").map((q) => ({ qid: q.id, chosen: r[q.id] === undefined ? null : Number(r[q.id]) }));
      c.written = qs.filter((q) => q.type === "written").map((q) => ({ qid: q.id, text: r[q.id] || "" }));
      const vq = qs.find((q) => q.type === "video");
      if (vq) { c.videoQ = vq.id; c.videoDur = o.videoDuration || 0; c.hasVideo = !!o.videoRecorded; }
    } else if (o.startedAt && qs.length) {
      c.attempt = { qids: qs.map((q) => q.id), answers: r, warnings: 0, retakesUsed: 0, videoTakes: o.videoRecorded ? 1 : 0 };
    }
    return c;
  });
  const drives = (ws.drives || []).map((d) => ({ id: d.id, name: d.name, college: d.college || "—", city: d.city || "—", date: d.date || new Date().toISOString().slice(0, 10), closes: d.closes || addWeek(d.date), status: d.status || "Active" }));
  return { version: VERSION, settings: { ...DEFAULT_SETTINGS, ...(ws.settings || {}) }, drives, questions: questions.length ? questions : seed.questions, users: ws.users || [], candidates, events: [...(ws.events || []), ...events] };
}

async function readRaw(client) {
  if (client) {
    const result = await client.query("SELECT payload FROM workspace_state WHERE id = 1 FOR UPDATE");
    return result.rows[0]?.payload || null;
  }
  try { return JSON.parse(await readFile(workspacePath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function writeRaw(client, workspace) {
  if (client) {
    await client.query("INSERT INTO workspace_state (id, payload, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()", [JSON.stringify(workspace)]);
    return;
  }
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${workspacePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(workspace, null, 2), "utf8");
  await rename(temporaryPath, workspacePath);
}

// HR_ADMIN_EMAIL / HR_ADMIN_PASSWORD guarantee a working admin login, so access can't be locked out.
function ensureAdmin(ws) {
  const email = process.env.HR_ADMIN_EMAIL?.trim().toLowerCase(), password = process.env.HR_ADMIN_PASSWORD;
  if (!email || !password) return;
  const u = ws.users.find((x) => x.email.toLowerCase() === email);
  if (!u) ws.users.push({ id: makeId("u"), name: "Admin", email, role: "HR Admin", status: "Active", last: null, passwordHash: hashPassword(password) });
  else if (!u.passwordHash) { u.passwordHash = hashPassword(password); u.role = "HR Admin"; }
}

// Serialises writes in this process; Postgres also row-locks across instances.
let chain = Promise.resolve();
function locked(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export async function getWorkspace() {
  return mutateWorkspace(() => undefined);
}

// fn receives the workspace, mutates it in place and may return a value. Throwing aborts without saving.
export async function mutateWorkspace(fn) {
  return locked(async () => {
    const db = await ensureDatabase();
    const client = db ? await pool.connect() : null;
    try {
      if (client) await client.query("BEGIN");
      const raw = await readRaw(client);
      const workspace = raw ? migrate(raw) : makeSeedWorkspace();
      const before = raw && raw.version === VERSION ? JSON.stringify(raw) : null;
      ensureAdmin(workspace);
      const result = await fn(workspace);
      if (JSON.stringify(workspace) !== before) await writeRaw(client, workspace);
      if (client) await client.query("COMMIT");
      return result === undefined ? workspace : result;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client?.release();
    }
  });
}

export function logEvent(workspace, cid, type, text, warn = false) {
  workspace.events.push({ id: eid(), cid, at: new Date().toISOString(), type, text, warn: !!warn });
}

export const videoPath = (candidateId) => path.join(dataDirectory, "videos", `${candidateId.replace(/[^\w-]/g, "")}.webm`);
