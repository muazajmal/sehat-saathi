"use client";

import { useState } from "react";
import Link from "next/link";
import { apiCall, ApiError } from "../lib/api";
import Logo from "./Logo";

/** A hospital or clinic applies. Its admin can log in once the Sehat Saathi owner approves it. */
export default function HospitalJoin() {
  const [f, setF] = useState({ name: "", city: "Multan", address: "", phone: "", admin_name: "", admin_phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  if (done)
    return (
      <main className="gate">
        <div className="gate-card glass">
          <Logo />
          <h1>Application received ✓</h1>
          <p>Thank you. We&apos;ll check your details and approve <b>{f.name}</b>, usually within one working day.</p>
          <p>Once approved, log in with <b>{f.admin_phone}</b> and your password, then add your doctors on the Team page.
            Your patients can choose your hospital at <code>/patient?h={done}</code>.</p>
          <Link className="btn btn-primary" href="/login?as=staff">Go to hospital login</Link>
        </div>
      </main>
    );

  return (
    <main className="gate">
      <form
        className="gate-card glass"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await apiCall<{ slug: string }>("/api/tenants/apply", { method: "POST", body: JSON.stringify(f) });
            setDone(r.slug);
          } catch (x) {
            setError(x instanceof ApiError ? x.message : String(x));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Logo href="/app" />
        <h1>Bring Sehat Saathi to your hospital</h1>
        <p>Urdu voice triage, a doctor&apos;s desk, reminders that cut no-shows, and monthly reports. Your patients&apos; data stays yours.</p>
        <label htmlFor="h-name">Hospital or clinic name</label>
        <input id="h-name" value={f.name} onChange={set("name")} placeholder="Al-Shifa Trust Clinic" />
        <label htmlFor="h-city">City</label>
        <input id="h-city" value={f.city} onChange={set("city")} />
        <label htmlFor="h-addr">Address</label>
        <input id="h-addr" value={f.address} onChange={set("address")} />
        <label htmlFor="h-phone">Hospital phone</label>
        <input id="h-phone" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="061 1234567" />
        <label htmlFor="h-admin">Admin&apos;s name (runs your desk)</label>
        <input id="h-admin" value={f.admin_name} onChange={set("admin_name")} />
        <label htmlFor="h-aphone">Admin&apos;s mobile (their login)</label>
        <input id="h-aphone" inputMode="tel" value={f.admin_phone} onChange={set("admin_phone")} placeholder="0300 1234567" />
        <label htmlFor="h-pass">Password (at least 8 characters)</label>
        <input id="h-pass" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" type="submit"
          disabled={busy || f.name.trim().length < 3 || f.phone.trim().length < 6 || f.admin_name.trim().length < 2 || f.admin_phone.trim().length < 6 || f.password.length < 8}>
          {busy ? "Sending…" : "Apply"}
        </button>
        <p className="muted">
          By applying you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.
        </p>
      </form>
    </main>
  );
}
