import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getWorkspace, saveWorkspace } from "../../../../lib/workspace-store";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { token } = await params;
  const workspace = await getWorkspace();
  const candidate = workspace.candidates.find((item) => item.inviteToken === token);
  if (!candidate || !candidate.questionIds.some((id) => workspace.questions.find((question) => question.id === id)?.type === "video")) {
    return NextResponse.json({ error: "Video response is not available." }, { status: 404 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) return NextResponse.json({ error: "Video must be under 10 MB." }, { status: 413 });
  const videoDirectory = path.join(process.cwd(), "data", "videos");
  await mkdir(videoDirectory, { recursive: true });
  const videoPath = path.join(videoDirectory, `${candidate.id}.webm`);
  await writeFile(videoPath, bytes);
  candidate.videoRecorded = true;
  candidate.videoDuration = Math.min(15, Math.max(1, Number(request.headers.get("x-recording-seconds") || 15)));
  await saveWorkspace(workspace);
  return NextResponse.json({ saved: true });
}

export async function GET(_request, { params }) {
  const { token } = await params;
  const workspace = await getWorkspace();
  const candidate = workspace.candidates.find((item) => item.inviteToken === token);
  if (!candidate || !candidate.videoRecorded) return NextResponse.json({ error: "No video response is available." }, { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "data", "videos", `${candidate.id}.webm`));
    return new Response(bytes, { headers: { "Content-Type": "video/webm", "Content-Length": String(bytes.length), "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Video file is unavailable." }, { status: 404 });
  }
}