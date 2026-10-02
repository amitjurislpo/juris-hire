import { NextResponse } from "next/server";
import { authConfigured, clearedCookie, currentUser, recordSignIn, sessionCookie, signInBlocked, unauthorized } from "../../lib/auth";
import { isEmail } from "../../lib/domain";
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
  if (!isEmail(em) || !password) return NextResponse.json({ error: "Enter your work email and password." }, { status: 400 });
  if (!authConfigured()) return NextResponse.json({ error: "Sign-in isn’t configured on this server (AUTH_SECRET is missing)." }, { status: 503 });
  if (signInBlocked(em)) return NextResponse.json({ error: "Too many attempts. Wait 15 minutes and try again." }, { status: 429 });
  try {
    const user = await mutateWorkspace((ws) => {
      const u = ws.users.find((x) => x.email.toLowerCase() === em);
      if (!u || u.status === "Disabled" || !verifyPassword(password, u.passwordHash)) return null;
      u.status = "Active";
      u.last = new Date().toISOString();
      return publicUser(u);
    });
    recordSignIn(em, !!user);
    if (!user) return NextResponse.json({ error: DENIED }, { status: 401 });
    const response = NextResponse.json({ me: user });
    response.cookies.set(sessionCookie(user.id, !!remember));
    return response;
  } catch (error) {
    console.error("Sign-in error:", error);
    return NextResponse.json({ error: "Sign-in is unavailable right now. Please try again shortly." }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(clearedCookie);
  return response;
}
