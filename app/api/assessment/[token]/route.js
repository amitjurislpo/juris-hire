import { NextResponse } from "next/server";
import { QUESTION_TYPES, VIOLATION_TEXT, driveOf, driveOpen, planCounts, planQuestionIds, publicQuestion, pushStatus, qById, words } from "../../../lib/domain";
import { emailConfigured, sendConfirmation } from "../../../lib/email";
import { logEvent, mutateWorkspace } from "../../../lib/workspace-store";

export const runtime = "nodejs";

const GRACE_MS = 20000;
// The link is public, so client-reported events are limited to known types and a per-employee cap.
const CLIENT_EVENTS = new Set(["eligible", "device"]);
const MAX_CLIENT_EVENTS = 50;
const MAX_ANSWER_CHARS = 6000;

class Refusal extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

function find(ws, token) {
  const c = typeof token === "string" && ws.candidates.find((x) => x.token === token);
  if (!c) throw new Refusal("This assessment link is not valid.", 404);
  return c;
}

const trimWords = (text, limit) => (limit > 0 && words(text) > limit ? String(text).trim().split(/\s+/).slice(0, limit).join(" ") : String(text || ""));

function finalize(ws, c, timedOut) {
  const a = c.attempt, s = a.settings;
  const qs = a.qids.map((id) => qById(ws, id)).filter(Boolean);
  c.submittedAt = new Date().toISOString();
  c.duration = Math.max(1, Math.round((Date.now() - new Date(c.startedAt).getTime()) / 60000));
  c.mcq = qs.filter((q) => q.type === "mcq").map((q) => ({ qid: q.id, chosen: Number.isInteger(a.answers[q.id]) ? a.answers[q.id] : null }));
  c.written = qs.filter((q) => q.type === "written").map((q) => ({ qid: q.id, text: trimWords(a.answers[q.id], s.wordLimit) }));
  logEvent(ws, c.id, "submit", timedOut ? "Auto-submitted when time ran out" : "Assessment submitted");
  pushStatus(c, "completed", "System");
}

function expireIfOverdue(ws, c) {
  const a = c.attempt;
  if (c.status === "started" && a?.deadline && Date.now() > new Date(a.deadline).getTime() + GRACE_MS) finalize(ws, c, true);
}

// What the employee is allowed to know: a coarse state, never HR's decision.
function stateOf(ws, c) {
  if (c.status === "started") return c.attempt ? "started" : "closed";
  if (c.status === "terminated") return "terminated";
  if (c.submittedAt) return "submitted";
  if (c.status === "invited") return driveOpen(driveOf(ws, c)) ? "open" : "closed";
  return "closed";
}

function view(ws, c) {
  const d = driveOf(ws, c), a = c.attempt, state = stateOf(ws, c);
  // Question counts follow the employee's own plan, not just the global rules.
  const counts = a && state === "started"
    ? Object.fromEntries(QUESTION_TYPES.map((t) => [t, a.qids.filter((id) => qById(ws, id)?.type === t).length]))
    : planCounts(ws, c);
  return {
    state,
    closedReason: state === "closed" && c.status === "invited" ? "expired" : null,
    candidate: { name: c.name, email: c.email, token: c.token, college: c.college || d.college },
    drive: { name: d.name, college: d.college, closes: d.closes },
    settings: { ...((state === "started" && a?.settings) || ws.settings), ...counts },
    endReason: state === "terminated" ? c.endReason || "" : "",
    serverNow: new Date().toISOString(),
    attempt: state === "started" ? {
      questions: a.qids.map((id) => qById(ws, id)).filter(Boolean).map(publicQuestion),
      answers: a.answers, warnings: a.warnings, deadline: a.deadline, startedAt: c.startedAt,
    } : null,
  };
}

function applyViolation(ws, c, secs) {
  const a = c.attempt, s = a.settings;
  a.warnings += 1;
  c.tabs = (c.tabs || 0) + 1;
  if (a.warnings <= s.warnings) {
    logEvent(ws, c.id, "tab", `Tab hidden ${secs}s · warning ${a.warnings} of ${s.warnings} shown`, true);
    const remaining = s.warnings - a.warnings;
    return { outcome: "warning", message: `We noticed this page was hidden for about ${secs} second${secs > 1 ? "s" : ""}. This has been recorded. ${remaining ? `You have ${remaining} more warning${remaining > 1 ? "s" : ""} before the next switch will ${VIOLATION_TEXT[s.onViolation]}.` : `Switching again will ${VIOLATION_TEXT[s.onViolation]}.`}` };
  }
  if (s.onViolation === "flag") {
    logEvent(ws, c.id, "tab", `Tab hidden ${secs}s · flagged for HR review`, true);
    return { outcome: "flag" };
  }
  if (s.onViolation === "reset") {
    logEvent(ws, c.id, "tab", `Tab hidden ${secs}s · assessment reset`, true);
    Object.assign(a, { qids: planQuestionIds(ws, c, s), answers: {}, warnings: 0 });
    return { outcome: "reset" };
  }
  logEvent(ws, c.id, "terminated", `Tab hidden ${secs}s · assessment terminated`, true);
  c.endReason = "You switched away from the assessment more than the allowed number of times.";
  pushStatus(c, "terminated", "System");
  return { outcome: "terminate" };
}

const ACTIONS = {
  event(ws, c, body) {
    if (!CLIENT_EVENTS.has(body.type)) throw new Refusal("Unknown event.");
    const logged = ws.events.filter((e) => e.cid === c.id && CLIENT_EVENTS.has(e.type)).length;
    if (logged < MAX_CLIENT_EVENTS) logEvent(ws, c.id, body.type, String(body.text || "").slice(0, 200), !!body.warn);
    return { ok: true };
  },
  start(ws, c, body) {
    if (c.status === "started" && c.attempt) return view(ws, c);
    if (stateOf(ws, c) !== "open") throw new Refusal("This assessment is no longer open.", 409);
    if (!body.consent) throw new Refusal("Please agree to the recording terms before you start.");
    const s = { ...ws.settings };
    const qids = planQuestionIds(ws, c, s);
    if (!qids.length) throw new Refusal("This assessment isn’t ready yet. Please contact the HR team.", 409);
    c.startedAt = new Date().toISOString();
    c.device = String(body.device || "Desktop").slice(0, 60);
    c.attempt = { qids, answers: {}, warnings: 0, settings: s, deadline: s.timeLimit ? new Date(Date.now() + s.timeLimit * 60000).toISOString() : null };
    pushStatus(c, "started", "System");
    logEvent(ws, c.id, "start", "Assessment started");
    return view(ws, c);
  },
  resume(ws, c) {
    if (!c.attempt.settings.resume) {
      logEvent(ws, c.id, "terminated", "Page reopened · resume is not allowed", true);
      c.endReason = "The assessment page was closed or refreshed, and this assessment must be finished in one sitting.";
      pushStatus(c, "terminated", "System");
    } else logEvent(ws, c.id, "reconnect", "Page reopened · state restored");
    return view(ws, c);
  },
  answer(ws, c, body) {
    const a = c.attempt;
    const q = a.qids.includes(body.qid) && qById(ws, body.qid);
    if (!q) throw new Refusal("Question not found.");
    if (q.type === "mcq") {
      if (!Number.isInteger(body.value) || body.value < 0 || body.value >= q.options.length) throw new Refusal("Choose one of the options.");
      a.answers[q.id] = body.value;
    } else a.answers[q.id] = String(body.value ?? "").slice(0, MAX_ANSWER_CHARS);
    return { saved: true };
  },
  tab(ws, c, body) {
    const r = applyViolation(ws, c, Math.max(1, Math.min(3600, Math.round(Number(body.secs) || 1))));
    return { ...r, state: view(ws, c) };
  },
  submit(ws, c, body) {
    const a = c.attempt;
    const timedOut = !!body.timeout && !!a.deadline && Date.now() >= new Date(a.deadline).getTime() - 2000;
    // A manual submit must respect the word limit; a timed submit trims instead so it never fails.
    if (!timedOut && a.settings.wordLimit > 0 && a.qids.some((id) => qById(ws, id)?.type === "written" && words(a.answers[id]) > a.settings.wordLimit)) {
      throw new Refusal(`Please keep each written answer within ${a.settings.wordLimit} words before submitting.`);
    }
    finalize(ws, c, timedOut);
    return view(ws, c);
  },
};

const respond = async (fn) => {
  try { return await fn(); }
  catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Assessment API error:", error);
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a moment." }, { status: 500 });
  }
};

export async function GET(_request, { params }) {
  const { token } = await params;
  return respond(async () => NextResponse.json(await mutateWorkspace((ws) => { const c = find(ws, token); expireIfOverdue(ws, c); return view(ws, c); })));
}

export async function POST(request, { params }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  return respond(async () => {
    let confirm = null;
    const out = await mutateWorkspace((ws) => {
      const c = find(ws, token);
      const action = ACTIONS[body.action];
      if (!action) throw new Refusal("Unknown assessment action.");
      if (body.action === "event" || body.action === "start") return action(ws, c, body);
      if (c.status !== "started" || !c.attempt) throw new Refusal("This assessment is no longer open.", 409);
      expireIfOverdue(ws, c);
      // Returned rather than thrown: throwing would roll back the auto-submit that just happened.
      if (c.status !== "started") return { conflict: "Time is up — your answers were submitted automatically." };
      const result = action(ws, c, body);
      if (body.action === "submit") confirm = { candidate: { ...c }, drive: { ...driveOf(ws, c) } };
      return result;
    });
    if (out.conflict) return NextResponse.json({ error: out.conflict }, { status: 409 });
    if (confirm && emailConfigured()) sendConfirmation(confirm).catch((e) => console.error("Confirmation email failed:", e.message));
    return NextResponse.json(out);
  });
}
