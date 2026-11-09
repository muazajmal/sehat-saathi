"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/useSession";
import Logo from "./Logo";

type Door = "patient" | "staff";

const DEMO: Record<Door, { label: string; phone: string; password: string }[]> = {
  patient: [{ label: "Demo patient", phone: "0300 1112233", password: "patient123" }],
  staff: [
    { label: "Demo admin", phone: "0300 0000001", password: "admin123" },
    { label: "Demo doctor", phone: "0300 0000002", password: "doctor123" },
  ],
};

/** One login page with two doors: local patients, and hospital staff (doctors + admins). */
export default function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, save, ready } = useSession();
  const [door, setDoor] = useState<Door>(params.get("as") === "staff" ? "staff" : "patient");
  const [signup, setSignup] = useState(params.get("new") === "1");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const home = (role: string) => (role === "patient" ? "/patient/home" : "/desk");

  // Already logged in on this device: go straight to the right place.
  useEffect(() => {
    if (ready && session) router.replace(home(session.account.role));
  }, [ready, session, router]);

  const isSignup = door === "patient" && signup;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = isSignup ? await api.signup(phone, name, password) : await api.login(phone, password, door);
      save(s);
      router.push(home(s.account.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <form className="gate-card glass" onSubmit={submit}>
        <Link href="/app" className="link-btn" style={{ justifySelf: "start", fontSize: "0.875rem" }}>
          ← Back
        </Link>
        <Logo href="/app" />
        <div className="auth-tabs" role="group" aria-label="Who are you?">
          <button type="button" aria-pressed={door === "patient"} onClick={() => { setDoor("patient"); setError(null); }}>
            Patient
          </button>
          <button type="button" aria-pressed={door === "staff"} onClick={() => { setDoor("staff"); setSignup(false); setError(null); }}>
            Hospital / Doctor
          </button>
        </div>

        {door === "patient" ? (
          <>
            <h1>{isSignup ? "Create your account" : "Patient login"}</h1>
            <p>{isSignup ? "Free. See every request you send and what the doctor decided." : "See your requests, bookings and the doctor's replies."}</p>
            <p className="auth-urdu">{isSignup ? "مفت اکاؤنٹ بنائیں اور اپنی تمام درخواستیں دیکھیں" : "اپنی درخواستیں اور ڈاکٹر کا جواب دیکھیں"}</p>
          </>
        ) : (
          <>
            <h1>Hospital login</h1>
            <p>For doctors and hospital admins. Doctors are added by their hospital admin.</p>
          </>
        )}

        {isSignup && (
          <>
            <label htmlFor="l-name">Your name</label>
            <input id="l-name" autoComplete="name" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <label htmlFor="l-phone">Phone number</label>
        <input
          id="l-phone"
          inputMode="tel"
          autoComplete="username"
          placeholder="0300 1234567"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <label htmlFor="l-pass">Password{isSignup ? " (at least 6 letters)" : ""}</label>
        <input
          id="l-pass"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || phone.trim().length < 6 || password.length < (isSignup ? 6 : 1) || (isSignup && name.trim().length < 2)}
        >
          {busy ? "Please wait…" : isSignup ? "Create account" : "Log in"}
        </button>

        {door === "patient" && (
          <p className="muted">
            {isSignup ? "Already have an account? " : "New here? "}
            <button type="button" className="link-btn" onClick={() => { setSignup(!signup); setError(null); }}>
              {isSignup ? "Log in" : "Create a free account"}
            </button>
            <br />
            In pain right now? <Link href="/patient">Get help without an account</Link> or call <a href="tel:1122">1122</a>.
          </p>
        )}

        <div className="demo-logins">
          Demo accounts (sample data):
          <br />
          {DEMO[door].map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => {
                setSignup(false);
                setPhone(d.phone);
                setPassword(d.password);
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </form>
    </main>
  );
}
