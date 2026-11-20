import { NextResponse } from "next/server";
import { isStaff } from "./auth.js";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(status: number, error: string, message: string) {
  return json({ error, message }, status);
}

/** Runs a staff-only handler; answers 401 if the device is not signed in. */
export async function staffOnly(handler: () => Promise<Response>): Promise<Response> {
  if (!(await isStaff())) return fail(401, "unauthorized", "Connexion requise");
  try {
    return await handler();
  } catch (e) {
    const err = e as Error;
    if (err.name === "SlotUnavailableError") return fail(409, "slot_unavailable", "Cette heure n'est plus disponible");
    console.error(err);
    return fail(500, "server_error", "Erreur du serveur");
  }
}
