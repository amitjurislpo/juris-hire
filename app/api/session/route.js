import { NextResponse } from "next/server";
import { clearedCookie, currentUser, sessionCookie, unauthorized } from "../../lib/auth";
import { publicUser, verifyPassword } from "../../lib/password";
import { mutateWorkspace } from "../../lib/workspace-store";

export const runtime = "nodejs";

const DENIED = "That email and password don’t match an HR account.";

export async function GET() {
  const me = await currentUser();
  return me ? NextResponse.json({ me }) : unauthorized();
}

export async function POST(request) {
  const { email, password, remember } = await request.json().catch(() => ({}));
  const em = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(em) || !password) return NextResponse.json({ error: "Enter your work email and password." }, { status: 400 });
  const user = await mutateWorkspace((ws) => {
    const u = ws.users.find((x) => x.email.toLowerCase() === em);
    if (!u || u.status === "Disabled" || !verifyPassword(password, u.passwordHash)) return null;
    u.status = "Active";
    u.last = new Date().toISOString();
    return publicUser(u);
  });
  if (!user) return NextResponse.json({ error: DENIED }, { status: 401 });
  const response = NextResponse.json({ me: user });
  response.cookies.set(sessionCookie(user.id, !!remember));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(clearedCookie);
  return response;
}
