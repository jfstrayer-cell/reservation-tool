"use client";

import { useState } from "react";

export default function Login() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/staff/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    setBusy(false);
    if (res.ok) window.location.href = "/staff";
    else setError((await res.json().catch(() => ({}))).message ?? "Erreur");
  }

  return (
    <main className="wrap login">
      <h1>Réservations</h1>
      <p className="muted">Entrez le code de l’équipe. Cet appareil restera connecté 30 jours.</p>
      <form onSubmit={submit}>
        <input autoFocus type="password" inputMode="numeric" placeholder="Code" value={pin} onChange={(e) => setPin(e.target.value)} />
        <button className="primary" disabled={busy || !pin}>Entrer</button>
      </form>
      {error && <div className="error" role="alert">{error}</div>}
    </main>
  );
}
