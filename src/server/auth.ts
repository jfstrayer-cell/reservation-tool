// Staff access for the pilot: a PIN shared by the team, exchanged for a signed cookie
// valid 30 days on that device. Personal codes per staff member come later (phase 3b).
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "staff_session";
const MAX_AGE_S = 30 * 24 * 3600;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSession(): { name: string; value: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `staff.${exp}`;
  return { name: COOKIE, value: `${payload}.${sign(payload)}`, maxAge: MAX_AGE_S };
}

export function verifySession(value: string | undefined): boolean {
  if (!value) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i);
  const sig = value.slice(i + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now() / 1000;
}

export function checkPin(pin: unknown): boolean {
  const expected = process.env.STAFF_PIN;
  if (!expected || typeof pin !== "string") return false;
  const a = crypto.createHash("sha256").update(pin).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function isStaff(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
