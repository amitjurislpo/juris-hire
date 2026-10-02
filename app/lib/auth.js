import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicUser } from "./password";
import { getWorkspace } from "./workspace-store";

const COOKIE = "jh_session";
const MAX_AGE = 60 * 60 * 12;
const secret = () => process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-secret");

const sign = (value) => createHmac("sha256", secret()).update(value).digest("base64url");

export function sessionCookie(userId, remember) {
  if (!secret()) throw new Error("AUTH_SECRET is not configured.");
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + (remember ? MAX_AGE * 14 : MAX_AGE) * 1000 })).toString("base64url");
  return { name: COOKIE, value: `${payload}.${sign(payload)}`, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: remember ? MAX_AGE * 14 : MAX_AGE };
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
export async function currentUser(workspace) {
  const session = readSession((await cookies()).get(COOKIE)?.value);
  if (!session) return null;
  const ws = workspace || await getWorkspace();
  const user = ws.users.find((u) => u.id === session.uid);
  return user && user.status !== "Disabled" ? publicUser(user) : null;
}

export const unauthorized = () => NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "Your role doesn’t allow this action." }, { status: 403 });
