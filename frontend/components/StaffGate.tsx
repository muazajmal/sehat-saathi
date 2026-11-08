"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { api, ApiError, staffCode } from "../lib/api";
import Logo from "./Logo";

/** The desk holds real patients' details, so it asks for the clinic's staff code when one is set. */
export default function StaffGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "open" | "locked">("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const h = await api.health();
      if (!h.staff_code_required) return setState("open");
      await api.staffCheck();
      setState("open");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState("locked");
      else setState("open"); // the desk shows its own connection errors
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <p className="empty">Loading the desk…</p>;

  return (
    <main className="gate">
      <form
        className="gate-card glass"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          staffCode.set(code.trim());
          try {
            await api.staffCheck();
            setState("open");
          } catch {
            staffCode.set("");
            setError("That code didn't work. Ask the clinic admin for the current staff code.");
          }
        }}
      >
        <Logo />
        <h1>Clinic desk</h1>
        <p>This area has patients&apos; details. Enter your clinic&apos;s staff access code.</p>
        <label htmlFor="staff-code">Staff access code</label>
        <input
          id="staff-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={code.trim().length < 4}>
          Open the desk
        </button>
        <p className="muted">
          Not staff? <Link href="/patient">Get help as a patient</Link>
        </p>
      </form>
    </main>
  );
}
