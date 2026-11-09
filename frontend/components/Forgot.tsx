"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiCall, ApiError } from "../lib/api";
import Logo from "./Logo";

export default function Forgot() {
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="gate">
      <form className="gate-card glass" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const r = await apiCall<{ message: string }>("/api/auth/forgot", { method: "POST", body: JSON.stringify({ phone }) });
          setMsg(r.message);
        } catch (x) {
          setError(x instanceof ApiError ? x.message : String(x));
        }
      }}>
        <Logo href="/app" />
        <h1>Forgot your password?</h1>
        {msg ? (
          <p className="ok-note">{msg}</p>
        ) : (
          <>
            <p>Enter your phone number. If your account has an email, we&apos;ll send a link to choose a new password.</p>
            <label htmlFor="f-phone">Phone number</label>
            <input id="f-phone" inputMode="tel" dir="ltr" placeholder="0300 1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {error && <div className="error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={phone.trim().length < 6}>Send reset link</button>
          </>
        )}
        <p className="muted">
          No email on your account? Hospital staff: ask your hospital admin to reset it. Patients: you can still get help without
          logging in at <Link href="/patient">/patient</Link>.
        </p>
      </form>
    </main>
  );
}

export function ResetPassword() {
  const p = useSearchParams();
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="gate">
      <form className="gate-card glass" onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await apiCall("/api/auth/reset", { method: "POST", body: JSON.stringify({ u: Number(p.get("u")), t: p.get("t") ?? "", password: pw }) });
          setDone(true);
        } catch (x) {
          setError(x instanceof ApiError ? x.message : String(x));
        }
      }}>
        <Logo href="/app" />
        <h1>Choose a new password</h1>
        {done ? (
          <>
            <p className="ok-note">Your password has been changed.</p>
            <Link className="btn btn-primary" href="/login">Log in</Link>
          </>
        ) : (
          <>
            <label htmlFor="r-pw">New password (at least 6 characters)</label>
            <input id="r-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            {error && <div className="error">{error}</div>}
            <button className="btn btn-primary" type="submit" disabled={pw.length < 6}>Save new password</button>
          </>
        )}
      </form>
    </main>
  );
}
