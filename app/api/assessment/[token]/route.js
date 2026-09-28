import { NextResponse } from "next/server";
import { getWorkspace, saveWorkspace } from "../../../lib/workspace-store";

export const runtime = "nodejs";

function publicQuestion(question) {
  const { correctIndex, ...safeQuestion } = question;
  return safeQuestion;
}

export async function GET(_request, { params }) {
  const { token } = await params;
  const workspace = await getWorkspace();
  const candidate = workspace.candidates.find((item) => item.inviteToken === token);
  if (!candidate) return NextResponse.json({ error: "This assessment link is not valid." }, { status: 404 });
  const questions = candidate.questionIds.map((id) => workspace.questions.find((question) => question.id === id)).filter(Boolean).map(publicQuestion);
  return NextResponse.json({ candidate: { id: candidate.id, name: candidate.name, status: candidate.status, responses: candidate.responses || {}, flags: candidate.flags || 0, videoRecorded: candidate.videoRecorded || false, startedAt: candidate.startedAt || null, completedAt: candidate.completedAt || null }, questions });
}

export async function POST(request, { params }) {
  const { token } = await params;
  const payload = await request.json();
  const workspace = await getWorkspace();
  const candidate = workspace.candidates.find((item) => item.inviteToken === token);
  if (!candidate) return NextResponse.json({ error: "This assessment link is not valid." }, { status: 404 });
  if (["Assessment Completed", "Assessment Terminated"].includes(candidate.status)) {
    return NextResponse.json({ error: "This assessment is closed." }, { status: 409 });
  }

  if (payload.action === "start") {
    candidate.startedAt ||= new Date().toISOString();
    candidate.status = "Assessment Started";
  } else if (payload.action === "answer") {
    if (!candidate.questionIds.includes(payload.questionId)) return NextResponse.json({ error: "Question not found." }, { status: 400 });
    candidate.responses ||= {};
    candidate.responses[payload.questionId] = payload.answer;
  } else if (payload.action === "event") {
    candidate.activityEvents ||= [];
    candidate.activityEvents.push({ type: payload.event || "visibilitychange", at: new Date().toISOString() });
    candidate.flags = candidate.activityEvents.length;
    if (candidate.flags >= 3) candidate.status = "Assessment Terminated";
  } else if (payload.action === "submit") {
    const requiredQuestions = candidate.questionIds.map((id) => workspace.questions.find((question) => question.id === id)).filter(Boolean);
    const missing = requiredQuestions.some((question) => question.type === "video"
      ? !candidate.videoRecorded
      : candidate.responses?.[question.id] === undefined || candidate.responses?.[question.id] === "");
    if (missing) return NextResponse.json({ error: "Complete every question, including the video response, before submitting." }, { status: 400 });
    const multipleChoice = requiredQuestions.filter((question) => question.type === "mcq");
    const correct = multipleChoice.filter((question) => Number(candidate.responses[question.id]) === question.correctIndex).length;
    candidate.score = Math.round((correct / multipleChoice.length) * 100);
    candidate.completedAt = new Date().toISOString();
    candidate.status = "Assessment Completed";
  } else {
    return NextResponse.json({ error: "Unknown assessment action." }, { status: 400 });
  }

  await saveWorkspace(workspace);
  return NextResponse.json({ saved: true, status: candidate.status, flags: candidate.flags || 0 });
}