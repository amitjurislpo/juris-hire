import { NextResponse } from "next/server";
import { currentUser, forbidden, unauthorized } from "../../lib/auth";
import { AddError, addEmployees } from "../../lib/add-employees";
import { HR_STATUSES, NEEDS_SUBMISSION, QUESTION_TYPES, ROLES, SL, cleanSettings, driveOf, driveOpen, isEmail, makeId, makeToken, planCounts, pushStatus, today } from "../../lib/domain";
import { appOrigin, sendInvitations } from "../../lib/email";
import { MIN_PASSWORD, hashPassword, publicWorkspace } from "../../lib/password";
import { getWorkspace, logEvent, mutateWorkspace } from "../../lib/workspace-store";

export const runtime = "nodejs";

// Sending links may also set questions; that part needs an admin (checked in POST).
const ADMIN_OPS = new Set(["saveDrive", "setDriveStatus", "addEmployee", "saveQuestion", "deleteQuestion", "toggleQuestion", "saveSettings", "inviteUser", "setRole", "setPassword"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class OpError extends Error {}
const fail = (message) => { throw new OpError(message); };
const now = () => new Date().toISOString();
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const findCandidate = (ws, id) => ws.candidates.find((c) => c.id === id) || fail("Employee not found.");
const findDrive = (ws, id) => ws.drives.find((d) => d.id === id) || fail("Drive not found.");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// null = draw from the assessment rules; otherwise the exact questions HR picked.
function cleanQuestionIds(ws, ids) {
  if (ids == null) return null;
  if (!Array.isArray(ids)) fail("Select at least one question.");
  const valid = [...new Set(ids)].filter((id) => ws.questions.some((q) => q.id === id && QUESTION_TYPES.includes(q.type)));
  if (!valid.length) fail("Select at least one question.");
  return valid;
}
const checkPassword = (p) => { if (String(p || "").length < MIN_PASSWORD) fail(`Passwords need at least ${MIN_PASSWORD} characters.`); };

function checkDriveFields({ name, college, date, closes }) {
  if (!text(name) || !text(college)) fail("Add a drive name and college.");
  if (!DATE.test(date || "") || !DATE.test(closes || "")) fail("Choose a session date and a closing date.");
  if (closes < date) fail("The link must close on or after the session date.");
}

const OPS = {
  setStatus(ws, me, { ids, to }) {
    if (!HR_STATUSES.includes(to)) fail("That status is set by the assessment itself, not by HR.");
    const list = (Array.isArray(ids) ? ids : []).map((id) => findCandidate(ws, id));
    if (!list.length) fail("Select at least one employee.");
    const eligible = list.filter((c) => c.submittedAt || !NEEDS_SUBMISSION.includes(to));
    if (!eligible.length) fail(`${SL[to]} needs a submitted assessment.`);
    eligible.forEach((c) => pushStatus(c, to, me.name));
    const skipped = list.length - eligible.length;
    return `${eligible.length === 1 ? eligible[0].name : plural(eligible.length, "employee")} moved to ${SL[to]}.${skipped ? ` ${skipped} skipped — no submitted assessment yet.` : ""}`;
  },
  openReview(ws, me, { id }) {
    const c = findCandidate(ws, id);
    if (c.status === "completed") pushStatus(c, "review", me.name);
  },
  addNote(ws, me, { id, text: note }) {
    const t = text(note, 4000);
    if (!t) fail("Write a note first.");
    const c = findCandidate(ws, id);
    c.notes = [...(c.notes || []), { text: t, by: me.name, at: now() }];
  },
  rate(ws, me, { id, key, value }) {
    const c = findCandidate(ws, id);
    if (!c.written?.some((w) => w.qid === key)) fail("That answer isn’t part of this assessment.");
    if (!Number.isInteger(value) || value < 1 || value > 5) fail("Ratings run from 1 to 5.");
    c.ratings = { ...(c.ratings || {}), [key]: value };
    if (c.status === "completed") pushStatus(c, "review", me.name);
  },
  allowAttempt(ws, me, { id }) {
    const c = findCandidate(ws, id);
    if (c.status !== "terminated") fail("Only terminated assessments can be reopened.");
    if (!driveOpen(driveOf(ws, c))) fail("This employee’s drive is closed. Reopen it or extend its closing date first.");
    pushStatus(c, "invited", me.name);
    Object.assign(c, { tabs: 0, attempt: null, startedAt: null, endReason: null, inviteSentAt: null, token: makeToken() });
    logEvent(ws, c.id, "start", `New attempt allowed by ${me.name}`);
    return "A new attempt is allowed with a fresh link. Send the invitation so the employee gets it.";
  },
  saveDrive(ws, me, input) {
    checkDriveFields(input);
    const fields = { name: text(input.name), college: text(input.college), city: text(input.city) || "—", date: input.date, closes: input.closes };
    if (input.id) {
      Object.assign(findDrive(ws, input.id), fields);
      return { id: input.id, message: "Drive updated." };
    }
    if (input.closes < today()) fail("The closing date can’t be in the past.");
    const d = { id: makeId("d"), ...fields, status: "Draft" };
    ws.drives.push(d);
    return { id: d.id, message: `Drive “${d.name}” created. Add employees to send invitations.` };
  },
  setDriveStatus(ws, me, { id, status }) {
    const d = findDrive(ws, id);
    if (!["Active", "Closed"].includes(status)) fail("Unknown drive status.");
    if (status === "Active" && d.closes < today()) fail("The closing date has passed. Edit the drive to extend it first.");
    d.status = status;
    return status === "Closed" ? "Drive closed — links no longer accept new attempts." : "Drive reopened.";
  },
  addEmployee(ws, me, { driveId, employee }) {
    return addEmployees(ws, me, driveId, [{ row: 1, ...(employee || {}) }]);
  },
  saveQuestion(ws, me, { question: q }) {
    if (!q || !QUESTION_TYPES.includes(q.type)) fail("That question type isn’t available.");
    const body = text(q.text, 1000);
    if (!body) fail("Write the question text.");
    const o = { type: q.type, text: body, cat: text(q.cat, 60) || "General", active: q.active !== false };
    if (q.type === "mcq") {
      o.options = (Array.isArray(q.options) ? q.options : []).map((x) => text(x, 300));
      if (o.options.length !== 4 || o.options.some((x) => !x)) fail("Fill in all four options.");
      if (new Set(o.options.map((x) => x.toLowerCase())).size !== 4) fail("Each option needs to be different.");
      o.correct = Number(q.correct);
      if (!Number.isInteger(o.correct) || o.correct < 0 || o.correct > 3) fail("Choose the correct option.");
    }
    const existing = q.id && ws.questions.find((x) => x.id === q.id);
    if (q.id && !existing) fail("Question not found.");
    if (existing) {
      if (existing.type !== o.type) fail("A question’s type can’t be changed.");
      Object.assign(existing, o);
      return { message: "Question updated.", id: existing.id };
    }
    const created = { id: makeId(o.type[0]), ...o };
    ws.questions.push(created);
    return { message: "Question added to the bank.", id: created.id };
  },
  deleteQuestion(ws, me, { id }) {
    const q = ws.questions.find((x) => x.id === id) || fail("Question not found.");
    // Answers, attempts and HR's picks reference questions by id, so referenced questions are retired instead.
    const used = ws.candidates.some((c) => [...(c.mcq || []), ...(c.written || [])].some((a) => a.qid === id) || c.attempt?.qids?.includes(id) || c.questionIds?.includes(id));
    if (used) { q.active = false; return "This question is in use, so it was deactivated instead of deleted."; }
    ws.questions = ws.questions.filter((x) => x.id !== id);
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
    const em = text(email, 254).toLowerCase();
    if (!text(name) || !isEmail(em)) fail("Add a name and a valid email.");
    if (!ROLES.includes(role)) fail("Unknown role.");
    if (ws.users.some((u) => u.email.toLowerCase() === em)) fail("That person already has access.");
    checkPassword(password);
    ws.users.push({ id: makeId("u"), name: text(name, 120), email: em, role, status: "Invited", last: null, passwordHash: hashPassword(password) });
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
};

// Emails go out after the database transaction, so a slow mail server never holds the lock.
async function deliverInvites(request, ids, me, questionIds) {
  ids = Array.isArray(ids) ? [...new Set(ids)] : [];
  // Questions are fixed once an attempt starts, so they're only applied to employees who haven't started.
  if (questionIds !== undefined) await mutateWorkspace((w) => {
    const picked = cleanQuestionIds(w, questionIds);
    for (const id of ids) {
      const c = w.candidates.find((x) => x.id === id);
      if (c?.status === "invited") c.questionIds = picked;
    }
  });
  const ws = await getWorkspace();
  const targets = ids.map((id) => ws.candidates.find((c) => c.id === id))
    .filter((c) => c && ["invited", "started"].includes(c.status) && driveOpen(driveOf(ws, c)));
  if (!targets.length) return { sent: 0, attempted: 0, skipped: ids.length, error: ids.length ? "None of the selected employees can receive a link (already submitted, or their drive is closed)." : "Select at least one employee." };
  const origin = appOrigin(request);
  const results = await sendInvitations(targets.map((c) => ({ candidate: c, drive: driveOf(ws, c), settings: { ...ws.settings, ...planCounts(ws, c) }, url: `${origin}/assessment/${c.token}` })));
  const sent = targets.filter((_, i) => results[i].ok).map((c) => c.id);
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
  return { sent: sent.length, attempted: targets.length, skipped: ids.length - targets.length, error: results.find((r) => !r.ok)?.error || null };
}

const serverError = (error) => {
  console.error("Workspace API error:", error);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
};

export async function GET() {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    return NextResponse.json({ workspace: publicWorkspace(await getWorkspace()), me });
  } catch (error) { return serverError(error); }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (body.op !== "sendInvites" && !OPS[body.op]) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const admin = me.role === "HR Admin";
    if ((ADMIN_OPS.has(body.op) || (body.op === "sendInvites" && body.questionIds !== undefined)) && !admin) return forbidden();
    let result = null, invites = null;
    if (body.op === "sendInvites") invites = await deliverInvites(request, body.ids, me, body.questionIds);
    else result = await mutateWorkspace((ws) => OPS[body.op](ws, me, body) ?? null);
    return NextResponse.json({ workspace: publicWorkspace(await getWorkspace()), result, invites });
  } catch (error) {
    if (error instanceof OpError || error instanceof AddError) return NextResponse.json({ error: error.message }, { status: 400 });
    return serverError(error);
  }
}
