import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { currentUser, unauthorized } from "../../../../lib/auth";
import { getWorkspace, videoPath } from "../../../../lib/workspace-store";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { id } = await params;
  const ws = await getWorkspace();
  if (!await currentUser(ws)) return unauthorized();
  const c = ws.candidates.find((x) => x.id === id);
  if (!c?.hasVideo) return NextResponse.json({ error: "No video response is available." }, { status: 404 });
  try {
    const bytes = await readFile(videoPath(c.id));
    return new Response(bytes, { headers: { "Content-Type": c.videoMime || "video/webm", "Content-Length": String(bytes.length), "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Video file is unavailable." }, { status: 404 });
  }
}
