import { NextRequest } from "next/server";
import { checkPin, makeSession } from "../../../../src/server/auth";
import { fail, json } from "../../../../src/server/http";

// Slows down guessing: at most 10 attempts per 10 minutes per address.
const attempts = new Map<string, { n: number; since: number }>();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const now = Date.now();
  const a = attempts.get(ip);
  const entry = a && now - a.since < 10 * 60_000 ? a : { n: 0, since: now };
  if (entry.n >= 10) return fail(429, "too_many_attempts", "Trop d'essais. Réessayez dans quelques minutes.");
  entry.n += 1;
  attempts.set(ip, entry);

  const body = await req.json().catch(() => ({}));
  if (!checkPin(body.pin)) return fail(401, "wrong_pin", "Code incorrect");
  attempts.delete(ip);
  const s = makeSession();
  const res = json({ ok: true });
  res.cookies.set(s.name, s.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: s.maxAge, path: "/" });
  return res;
}
