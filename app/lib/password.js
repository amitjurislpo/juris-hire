import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD = 8;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt$${salt}$${scryptSync(String(password), salt, 32).toString("base64url")}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const given = scryptSync(String(password), salt, expected.length);
  return timingSafeEqual(expected, given);
}

// Never send password hashes to the browser.
export const publicUser = ({ passwordHash, ...u }) => u;
export const publicWorkspace = (ws) => ({ ...ws, users: ws.users.map(publicUser) });
