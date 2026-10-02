import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicUser } from "./password";
import { getUserById } from "./workspace-store";

const COOKIE = "jh_session";
const DAY = 60 * 60 * 24;
const secret = () => process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret");

const sign = (value) => createHmac("sha256", secret()).update(value).digest("base64url");

export const authConfigured = () => !!secret();

export function sessionCookie(userId, remember) {
  const maxAge = remember ? DAY * 14 : DAY / 2;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + maxAge * 1000 })).toString("base64url");
  return { name: COOKIE, value: `${payload}.${sign(payload)}`, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}
export const clearedCookie = { name: COOKIE, value: "", path: "/", maxAge: 0 };

function readSession(value) {
  if (!value || !secret()) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload)), given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

// Returns the signed-in HR user (without the password hash), or null.
export async function currentUser() {
  const session = readSession((await cookies()).get(COOKIE)?.value);
  if (!session) return null;
  const user = await getUserById(session.uid);
  return user && user.status !== "Disabled" ? publicUser(user) : null;
}

/* ---------- sign-in throttling ---------- */
// Per email, in memory: enough to slow password guessing on a single server.
const FAIL_LIMIT = 5, FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

export function signInBlocked(email) {
  const f = failures.get(email);
  if (!f) return false;
  if (Date.now() - f.first > FAIL_WINDOW_MS) { failures.delete(email); return false; }
  return f.count >= FAIL_LIMIT;
}
export function recordSignIn(email, ok) {
  if (ok) { failures.delete(email); return; }
  const f = failures.get(email);
  if (!f || Date.now() - f.first > FAIL_WINDOW_MS) failures.set(email, { count: 1, first: Date.now() });
  else f.count += 1;
}

export const unauthorized = () => NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "Your role doesn’t allow this action." }, { status: 403 });
