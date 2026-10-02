import { NextResponse } from "next/server";
import { currentUser, forbidden, unauthorized } from "../../lib/auth";
import { DEFAULT_SETTINGS, ROLES, SETTING_CHOICES, SETTING_LIMITS, SL, driveOf, makeId, makeToken, planCounts, pushStatus } from "../../lib/domain";
import { appOrigin, sendInvitation } from "../../lib/email";
import { MIN_PASSWORD, hashPassword, publicWorkspace } from "../../lib/password";
import { getWorkspace, logEvent, mutateWorkspace } from "../../lib/workspace-store";

export const runtime = "nodejs";

const ADMIN_OPS = new Set(["createDrive", "updateDrive", "importCandidates", "saveQuestion", "deleteQuestion", "toggleQuestion", "saveSettings", "inviteUser", "setRole", "setPassword", "setQuestions"]);

class OpError extends Error {}
const fail = (message) => { throw new OpError(message); };
const now = () => new Date().toISOString();
const findCandidate = (ws, id) => ws.candidates.find((c) => c.id === id) || fail("Employee not found.");

// null = draw from the assessment rules; otherwise the exact questions HR picked.
function cleanQuestionIds(ws, ids) {
  if (ids == null) return null;
  const valid = [...new Set(ids)].filter((id) => ws.questions.some((q) => q.id === id));
  if (!valid.length) fail("Select at least one question.");
  return valid;
}
const checkPassword = (p) => { if (String(p || "").length < MIN_PASSWORD) fail(`Passwords need at least ${MIN_PASSWORD} characters.`); };

function cleanSettings(input) {
  const s = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const v = input?.[key];
    if (SETTING_LIMITS[key]) { const [mn, mx] = SETTING_LIMITS[key]; if (Number.isInteger(v)) s[key] = Math.max(mn, Math.min(mx, v)); }
    else if (SETTING_CHOICES[key]) { if (SETTING_CHOICES[key].includes(v)) s[key] = v; }
    else if (typeof v === "boolean") s[key] = v;
  }
  return s;
}

const OPS = {
  setStatus(ws, me, { ids, to }) {
    if (!SL[to]) fail("Unknown status.");
    const list = (ids || []).map((id) => findCandidate(ws, id));
    list.forEach((c) => pushStatus(c, to, me.name));
    return `${list.length === 1 ? list[0].name : `${list.length} candidates`} moved to ${SL[to]}.`;
  },
  openReview(ws, me, { id }) {
    const c = findCandidate(ws, id);
    if (c.status === "completed" && c.submittedAt) pushStatus(c, "review", me.name);
  },
  addNote(ws, me, { id, text }) {
    const t = String(text || "").trim();
    if (!t) fail("Write a note first.");
    findCandidate(ws, id).notes.push({ text: t.slice(0, 4000), by: me.name, at: now() });
  },
  rate(ws, me, { id, key, value }) {
    const c = findCandidate(ws, id);
    if (!(value >= 1 && value <= 5)) fail("Ratings run from 1 to 5.");
    c.ratings = { ...(c.ratings || {}), [key]: value };
    if (c.status === "completed") pushStatus(c, "review", me.name);
  },
  allowAttempt(ws, me, { id }) {
    const c = findCandidate(ws, id);
    if (c.status !== "terminated") fail("Only terminated assessments can be reopened.");
    pushStatus(c, "invited", me.name);
    Object.assign(c, { tabs: 0, attempt: null, startedAt: null, token: makeToken() });
    logEvent(ws, c.id, "start", `New attempt allowed by ${me.name}`);
    return "A new attempt is allowed with a fresh link.";
  },
  setQuestions(ws, me, { id, questionIds }) {
    const c = findCandidate(ws, id);
    if (c.status !== "invited") fail("Questions can only be changed before the assessment starts.");
    c.questionIds = cleanQuestionIds(ws, questionIds);
    return c.questionIds ? `${c.questionIds.length} questions selected for ${c.name}.` : `${c.name} will get questions drawn from the assessment rules.`;
  },
  createDrive(ws, me, { name, college, city, date, closes }) {
    if (!name?.trim() || !college?.trim()) fail("Add a drive name and college.");
    if (!date || !closes || closes < date) fail("The link must close on or after the session date.");
    const d = { id: makeId("d"), name: name.trim(), college: college.trim(), city: city?.trim() || "—", date, closes, status: "Draft" };
    ws.drives.push(d);
    return d.id;
  },
  updateDrive(ws, me, { id, status }) {
    const d = ws.drives.find((x) => x.id === id) || fail("Drive not found.");
    if (!["Draft", "Active", "Closed"].includes(status)) fail("Unknown drive status.");
    d.status = status;
  },
  importCandidates(ws, me, { driveId, rows, send, questionIds }) {
    const d = ws.drives.find((x) => x.id === driveId && x.status !== "Closed") || fail("Choose an open hiring drive.");
    const picked = cleanQuestionIds(ws, questionIds);
    const existing = new Set(ws.candidates.map((c) => c.email.toLowerCase()));
    const created = [];
    let duplicates = 0;
    for (const r of rows || []) {
      const email = String(r.email || "").trim(), name = String(r.name || "").trim();
      if (!name || !/^\S+@\S+\.\S+$/.test(email)) continue;
      if (existing.has(email.toLowerCase())) { duplicates++; continue; }
      existing.add(email.toLowerCase());
      const c = { id: makeId("c"), name, email, phone: String(r.phone || ""), college: String(r.college || ""), driveId: d.id, status: "invited", token: makeToken(), invitedAt: now(), history: [{ from: null, to: "invited", by: me.name, at: now() }], notes: [], ratings: {}, tabs: 0, questionIds: picked };
      ws.candidates.push(c);
      created.push(c.id);
    }
    if (!created.length) fail(duplicates ? "Every employee in this list has already been added." : "Nothing to add.");
    if (send && d.status === "Draft") d.status = "Active";
    return { created, duplicates };
  },
  saveQuestion(ws, me, { question: q }) {
    const text = String(q?.text || "").trim();
    if (!text) fail("Write the question text.");
    if (!["mcq", "written", "video"].includes(q.type)) fail("Unknown question type.");
    const o = { id: q.id, type: q.type, text, cat: String(q.cat || "").trim() || "General", active: q.active !== false };
    if (q.type === "mcq") {
      o.options = (q.options || []).map((x) => String(x).trim());
      if (o.options.length !== 4 || o.options.some((x) => !x)) fail("Fill in all four options.");
      o.correct = Math.max(0, Math.min(3, Number(q.correct) || 0));
    }
    const existing = q.id && ws.questions.find((x) => x.id === q.id);
    if (existing) { if (existing.type !== o.type) fail("A question’s type can’t be changed."); Object.assign(existing, o); }
    else { o.id = makeId(o.type[0]); ws.questions.push(o); }
    return { message: existing ? "Question updated." : "Question added to the bank.", id: o.id };
  },
  deleteQuestion(ws, me, { id }) {
    // Past answers reference questions by id, so used questions are retired instead of removed.
    const used = ws.candidates.some((c) => [...(c.mcq || []), ...(c.written || [])].some((a) => a.qid === id) || c.videoQ === id || c.attempt?.qids?.includes(id));
    if (used) { const q = ws.questions.find((x) => x.id === id); if (q) q.active = false; return "This question has been answered before, so it was deactivated instead of deleted."; }
    ws.questions = ws.questions.filter((q) => q.id !== id);
    return "Question deleted.";
  },
  toggleQuestion(ws, me, { id }) {
    const q = ws.questions.find((x) => x.id === id) || fail("Question not found.");
    q.active = !q.active;
  },
  saveSettings(ws, me, { settings }) {
    ws.settings = cleanSettings(settings);
  },
  inviteUser(ws, me, { name, email, role, password }) {
    const em = String(email || "").trim().toLowerCase();
    if (!String(name || "").trim() || !/^\S+@\S+\.\S+$/.test(em)) fail("Add a name and a valid email.");
    if (!ROLES.includes(role)) fail("Unknown role.");
    if (ws.users.some((u) => u.email.toLowerCase() === em)) fail("That person already has access.");
    checkPassword(password);
    ws.users.push({ id: makeId("u"), name: name.trim(), email: em, role, status: "Invited", last: null, passwordHash: hashPassword(password) });
    return `Access granted to ${em}. Share the portal link and their password with them.`;
  },
  setRole(ws, me, { id, role }) {
    const u = ws.users.find((x) => x.id === id) || fail("User not found.");
    if (!ROLES.includes(role)) fail("Unknown role.");
    if (u.role === "HR Admin" && role !== "HR Admin" && ws.users.filter((x) => x.role === "HR Admin").length === 1) fail("Keep at least one HR Admin.");
    u.role = role;
    return `${u.name} is now ${role}.`;
  },
  setPassword(ws, me, { id, password }) {
    const u = ws.users.find((x) => x.id === id) || fail("User not found.");
    checkPassword(password);
    u.passwordHash = hashPassword(password);
    return `Password updated for ${u.name}.`;
  },
  sendInvites() { /* handled below: needs network calls outside the lock */ },
};

export async function GET() {
  const ws = await getWorkspace();
  const me = await currentUser(ws);
  if (!me) return unauthorized();
  return NextResponse.json({ workspace: publicWorkspace(ws), me });
}

async function deliverInvites(request, ids, me) {
  const ws = await getWorkspace();
  const targets = ids.map((id) => ws.candidates.find((c) => c.id === id)).filter((c) => c && ["invited", "started"].includes(c.status));
  const results = await Promise.allSettled(targets.map((c) => sendInvitation({ candidate: c, drive: driveOf(ws, c), settings: { ...ws.settings, ...planCounts(ws, c) }, url: `${appOrigin(request)}/assessment/${c.token}` })));
  const sent = targets.filter((_, i) => results[i].status === "fulfilled").map((c) => c.id);
  const failed = results.find((r) => r.status === "rejected");
  if (sent.length) await mutateWorkspace((w) => {
    for (const id of sent) {
      const c = w.candidates.find((x) => x.id === id);
      if (!c) continue;
      c.inviteSentAt = now();
      logEvent(w, id, "invite", `Invitation email sent by ${me.name}`);
      const d = w.drives.find((x) => x.id === c.driveId);
      if (d?.status === "Draft") d.status = "Active";
    }
  });
  return { sent: sent.length, attempted: targets.length, error: failed?.reason?.message };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const me = await currentUser();
  if (!me) return unauthorized();
  if (!OPS[body.op]) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (ADMIN_OPS.has(body.op) && me.role !== "HR Admin") return forbidden();
  try {
    let result = await mutateWorkspace((ws) => OPS[body.op](ws, me, body) ?? null);
    let invites = null;
    if (body.op === "sendInvites") invites = await deliverInvites(request, body.ids || [], me);
    if (body.op === "importCandidates" && body.send) invites = await deliverInvites(request, result.created, me);
    return NextResponse.json({ workspace: publicWorkspace(await getWorkspace()), result, invites });
  } catch (error) {
    if (error instanceof OpError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
