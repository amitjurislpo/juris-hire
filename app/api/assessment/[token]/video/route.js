import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { qById } from "../../../../lib/domain";
import { logEvent, mutateWorkspace, videoPath } from "../../../../lib/workspace-store";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request, { params }) {
  const { token } = await params;
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return NextResponse.json({ error: "The recording must be under 25 MB." }, { status: 413 });
  const mime = /^video\/(webm|mp4)/.test(request.headers.get("content-type") || "") ? request.headers.get("content-type").split(";")[0] : "video/webm";

  const result = await mutateWorkspace(async (ws) => {
    const c = ws.candidates.find((x) => x.token === token);
    const a = c?.attempt;
    if (!c || c.status !== "started" || !a) return { error: "This assessment is no longer open.", status: 409 };
    const vq = a.qids.map((id) => qById(ws, id)).find((q) => q?.type === "video");
    if (!vq) return { error: "There is no video question in this assessment.", status: 404 };
    if ((a.videoTakes || 0) > a.settings.retakes) return { error: "No retakes left.", status: 409 };
    const dur = Math.max(1, Math.min(a.settings.videoMax, Math.round(Number(request.headers.get("x-recording-seconds")) || a.settings.videoMax)));
    const file = videoPath(c.id);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    a.videoTakes = (a.videoTakes || 0) + 1;
    a.answers[vq.id] = { dur };
    c.videoMime = mime;
    logEvent(ws, c.id, "video", `Video recorded · ${dur}s${a.videoTakes > 1 ? ` (take ${a.videoTakes})` : ""}${request.headers.get("x-auto-stopped") ? " · auto-stopped at limit" : ""}`);
    return { saved: true, dur, videoTakes: a.videoTakes };
  });
  return NextResponse.json(result, { status: result.status || 200 });
}
