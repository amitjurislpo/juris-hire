"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput, useToast } from "../../components/ui";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) return setError("Enter your work email and password.");
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error || "Sign-in failed.");
      router.replace("/hr");
    } catch { setError("Couldn’t reach the server. Check your connection."); }
    finally { setBusy(false); }
  }

  return <div className="login">
    <section className="login-art">
      <div className="brand"><div className="mark">J</div><div><b>Juris Consultants</b><small>Talent screening</small></div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <span className="eyebrow">College hiring · HR portal</span>
        <h1>Interview the <i>right</i> people, not everyone.</h1>
        <p style={{ color: "var(--muted)", fontSize: 16, lineHeight: 1.6, maxWidth: "46ch" }}>Structured first-round screening — multiple choice, written and video responses, reviewed in one place.</p>
      </div>
      <span className="mono" style={{ fontSize: 12, color: "#6B7487" }}>Authorised HR users only · all access is logged</span>
    </section>
    <section className="login-form"><form className="login-card" onSubmit={submit} noValidate>
      <div><h2 className="serif" style={{ fontSize: 40, lineHeight: "44px" }}>Sign in</h2><p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Use your Juris Consultants work account.</p></div>
      <label className="field"><span>Work email</span><input className="input" type="email" autoComplete="username" placeholder="name@jurislpo.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field"><span>Password</span><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--soft)" }}><input type="checkbox" className="check" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in</label>
        <a href="#" onClick={(e) => { e.preventDefault(); toast("Ask an HR Admin to reset your access."); }}>Forgot password?</a>
      </div>
      {error && <p role="alert" style={{ fontSize: 13, color: "var(--warn)" }}>{error}</p>}
      <button className="btn gold" type="submit" disabled={busy} style={{ minHeight: 52, fontSize: 15 }}>{busy ? "Signing in…" : "Sign in"}</button>
    </form></section>
  </div>;
}
