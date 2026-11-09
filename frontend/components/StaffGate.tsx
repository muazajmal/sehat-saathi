"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, ApiError, session } from "../lib/api";
import Logo from "./Logo";

/** The desk holds patients' details: only a logged-in doctor or hospital admin gets in. */
export default function StaffGate({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const [state, setState] = useState<"checking" | "open" | "locked" | "forbidden">("checking");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const s = session.get();
    if (s && s.account.role === "patient") return setState("locked");
    try {
      const h = await api.health();
      if (h.login_required === false && !h.staff_code_required && !adminOnly) return setState("open");
      if (!s) return setState("locked");
      await api.staffCheck();
      setState(adminOnly && s.account.role !== "admin" ? "forbidden" : "open");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        session.set(null);
        setState("locked");
      } else setState("open"); // the desk shows its own connection errors
    }
  }, [adminOnly]);

  useEffect(() => {
    check();
  }, [check]);

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <p className="empty">Loading the desk…</p>;
  if (state === "forbidden")
    return (
      <main className="gate">
        <div className="gate-card glass">
          <Logo />
          <h1>Admins only</h1>
          <p>Only the hospital admin can add or switch off doctors.</p>
          <Link className="btn btn-primary" href="/desk">
            Back to the queue
          </Link>
        </div>
      </main>
    );

  return (
    <main className="gate">
      <form
        className="gate-card glass"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            const s = await api.login(phone, password, "staff");
            session.set(s);
            await check();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't log in. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Logo />
        <h1>Hospital login</h1>
        <p>For doctors and hospital admins. Patients&apos; details are only shown to staff.</p>
        <label htmlFor="staff-phone">Phone number</label>
        <input
          id="staff-phone"
          inputMode="tel"
          autoComplete="username"
          placeholder="0300 1234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
        />
        <label htmlFor="staff-password">Password</label>
        <input
          id="staff-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || phone.trim().length < 6 || !password}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="muted">
          New doctor? Ask your hospital admin to add you. Not staff? <Link href="/login">Patient login</Link>
        </p>
      </form>
    </main>
  );
}
