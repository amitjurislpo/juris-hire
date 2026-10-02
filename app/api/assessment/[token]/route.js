import { NextResponse } from "next/server";
import { TYPE_ORDER, VIOLATION_TEXT, driveOf, planCounts, planQuestionIds, publicQuestion, pushStatus, qById } from "../../../lib/domain";
import { emailConfigured, sendConfirmation } from "../../../lib/email";
import { logEvent, mutateWorkspace } from "../../../lib/workspace-store";

export const runtime = "nodejs";

const GRACE_MS = 20000;
const EVENT_TYPES = new Set(["eligible", "perm", "device", "video"]);

class Refusal extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

function find(ws, token) {
  const c = ws.candidates.find((x) => x.token === token);
  if (!c) throw new Refusal("This assessment link is not valid.", 404);
  return c;
}

const linkClosed = (d) => d.status === "Closed" || (d.closes && new Date().toISOString().slice(0, 10) > d.closes);

function finalize(ws, c, timedOut) {
  const a = c.attempt, s = a.settings;
  const qs = a.qids.map((id) => qById(ws, id)).filter(Boolean);
  c.submittedAt = new Date().toISOString();
  c.duration = Math.max(1, Math.round((Date.now() - new Date(c.startedAt).getTime()) / 60000));
  c.mcq = qs.filter((q) => q.type === "mcq").map((q) => ({ qid: q.id, chosen: Number.isInteger(a.answers[q.id]) ? a.answers[q.id] : null }));
  c.written = qs.filter((q) => q.type === "written").map((q) => ({ qid: q.id, text: String(a.answers[q.id] || "") }));
  const vq = qs.find((q) => q.type === "video");
  if (vq) { c.videoQ = vq.id; c.videoDur = a.answers[vq.id]?.dur || 0; c.hasVideo = !!a.answers[vq.id]; }
  c.videoMax = s.videoMax;
  logEvent(ws, c.id, "submit", timedOut ? "Auto-submitted when time ran out" : "Assessment submitted");
  pushStatus(c, "completed", "System");
}

function expireIfOverdue(ws, c) {
  const a = c.attempt;
  if (c.status === "started" && a?.deadline && Date.now() > new Date(a.deadline).getTime() + GRACE_MS) finalize(ws, c, true);
}

function view(ws, c) {
  const d = driveOf(ws, c), a = c.attempt;
  // Question counts shown to the employee follow their own plan, not just the global rules.
  const counts = a ? Object.fromEntries(TYPE_ORDER.map((t) => [t, a.qids.filter((id) => qById(ws, id)?.type === t).length])) : planCounts(ws, c);
  const settings = { ...(a?.settings || ws.settings), ...counts };
  return {
    candidate: { name: c.name, email: c.email, token: c.token, status: c.status, college: c.college || d.college },
    drive: { name: d.name, college: d.college, closes: d.closes },
    settings, closed: c.status === "invited" && linkClosed(d), serverNow: new Date().toISOString(),
    endReason: c.endReason || "",
    attempt: c.status === "started" && a ? {
      questions: a.qids.map((id) => qById(ws, id)).filter(Boolean).map(publicQuestion),
      answers: a.answers, warnings: a.warnings, videoTakes: a.videoTakes || 0, deadline: a.deadline, startedAt: c.startedAt,
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
    Object.assign(a, { qids: planQuestionIds(ws, c, s), answers: {}, warnings: 0, videoTakes: 0 });
    return { outcome: "reset" };
  }
  logEvent(ws, c.id, "terminated", `Tab hidden ${secs}s · assessment terminated`, true);
  c.endReason = "You switched away from the assessment more than the allowed number of times.";
  pushStatus(c, "terminated", "System");
  return { outcome: "terminate" };
}

export async function GET(_request, { params }) {
  const { token } = await params;
  try {
    return NextResponse.json(await mutateWorkspace((ws) => { const c = find(ws, token); expireIfOverdue(ws, c); return view(ws, c); }));
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request, { params }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  let confirm = null;
  try {
    const out = await mutateWorkspace((ws) => {
      const c = find(ws, token);
      const d = driveOf(ws, c);

      if (body.action === "event") {
        if (!EVENT_TYPES.has(body.type)) throw new Refusal("Unknown event.");
        logEvent(ws, c.id, body.type, String(body.text || "").slice(0, 200), !!body.warn);
        return { ok: true };
      }

      if (body.action === "start") {
        if (c.status === "started") return view(ws, c);
        if (c.status !== "invited") throw new Refusal("This assessment is closed.", 409);
        if (linkClosed(d)) throw new Refusal("This assessment link has expired.", 409);
        if (!body.consent) throw new Refusal("Please agree to the recording terms before you start.");
        const s = { ...ws.settings };
        const qids = planQuestionIds(ws, c, s);
        if (!qids.length) throw new Refusal("This assessment isn’t ready yet. Please contact the HR team.", 409);
        const startedAt = new Date().toISOString();
        c.startedAt = startedAt;
        c.device = String(body.device || "Desktop").slice(0, 60);
        c.attempt = { qids, answers: {}, warnings: 0, videoTakes: 0, settings: s, deadline: s.timeLimit ? new Date(Date.now() + s.timeLimit * 60000).toISOString() : null };
        pushStatus(c, "started", "System");
        logEvent(ws, c.id, "start", "Assessment started");
        return view(ws, c);
      }

      if (c.status !== "started" || !c.attempt) throw new Refusal("This assessment is no longer open.", 409);
      expireIfOverdue(ws, c);
      if (c.status !== "started") return { ...view(ws, c), expired: true };
      const a = c.attempt;

      if (body.action === "resume") {
        if (!a.settings.resume) {
          logEvent(ws, c.id, "terminated", "Page reopened · resume is not allowed", true);
          c.endReason = "The assessment page was closed or refreshed, and this assessment must be finished in one sitting.";
          pushStatus(c, "terminated", "System");
        } else logEvent(ws, c.id, "reconnect", "Page reopened · state restored");
        return view(ws, c);
      }
      if (body.action === "answer") {
        const q = a.qids.includes(body.qid) && qById(ws, body.qid);
        if (!q || q.type === "video") throw new Refusal("Question not found.");
        if (q.type === "mcq") { if (!Number.isInteger(body.value) || body.value < 0 || body.value >= q.options.length) throw new Refusal("Choose one of the options."); a.answers[q.id] = body.value; }
        else a.answers[q.id] = String(body.value || "").slice(0, 6000);
        return { saved: true };
      }
      if (body.action === "tab") {
        const r = applyViolation(ws, c, Math.max(1, Math.min(3600, Math.round(Number(body.secs) || 1))));
        return { ...r, state: view(ws, c) };
      }
      if (body.action === "submit") {
        finalize(ws, c, !!body.timeout && !!a.deadline && Date.now() >= new Date(a.deadline).getTime() - 2000);
        confirm = { candidate: { ...c }, drive: { ...d } };
        return view(ws, c);
      }
      throw new Refusal("Unknown assessment action.");
    });
    if (confirm && emailConfigured()) sendConfirmation(confirm).catch((e) => console.error("Confirmation email failed:", e.message));
    return NextResponse.json(out);
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
