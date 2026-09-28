import { NextResponse } from "next/server";
import { getWorkspace, saveWorkspace } from "../../lib/workspace-store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getWorkspace());
}

export async function PUT(request) {
  const workspace = await request.json();
  if (!Array.isArray(workspace.candidates) || !Array.isArray(workspace.drives) || !Array.isArray(workspace.questions)) {
    return NextResponse.json({ error: "Invalid workspace data." }, { status: 400 });
  }
  await saveWorkspace(workspace);
  return NextResponse.json({ saved: true });
}