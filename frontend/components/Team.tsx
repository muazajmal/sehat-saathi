"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Account } from "../lib/api";
import { useSession } from "../lib/useSession";
import AppShell, { useStaff } from "./AppShell";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SPECIALTIES = ["general", "paediatrics", "gynaecology", "cardiology", "medicine", "surgery", "dermatology", "ent"];

/** Hospital admin: add doctors (they get their own login and appointment slots), switch them off, reset passwords. */
export default function Team() {
  const [staff, setStaff] = useStaff();
  const { session } = useSession();
  const [team, setTeam] = useState<Account[]>([]);
  const [patients, setPatients] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<{ id: number; pw: string } | null>(null);
  const [form, setForm] = useState({ role: "doctor" as "doctor" | "admin", name: "", phone: "", password: "", specialty: "general" });

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([api.team(), api.patientAccounts()]);
      setTeam(t);
      setPatients(p.length);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const a = await api.addStaff(form);
      setNote(
        a.role === "doctor"
          ? `${a.name} can now log in with ${a.phone}. Appointment slots for the next 6 days were added.`
          : `${a.name} can now log in as an admin.`,
      );
      setForm({ ...form, name: "", phone: "", password: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a: Account) {
    try {
      await api.setActive(a.id, !a.active);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function reset(a: Account, pw: string) {
    setError(null);
    setNote(null);
    try {
      await api.resetPassword(a.id, pw);
      setResetting(null);
      setNote(`Password changed for ${a.name}. Tell them the new one in person.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const doctors = team.filter((a) => a.role === "doctor");
  const admins = team.filter((a) => a.role === "admin");

  return (
    <AppShell staff={staff} onStaff={setStaff}>
      <div className="team">
        <header>
          <h1 style={{ margin: 0 }}>Team</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {session?.account.hospital || "Your hospital"}: who can log in to the desk and approve patients.
          </p>
        </header>
        <div className="team-stats">
          <span><b>{doctors.filter((d) => d.active).length}</b>{doctors.filter((d) => d.active).length === 1 ? "doctor" : "doctors"} active</span>
          <span><b>{admins.length}</b>{admins.length === 1 ? "admin" : "admins"}</span>
          <span><b>{patients}</b>{patients === 1 ? "patient account" : "patient accounts"}</span>
        </div>
        {error && <div className="error">{error}</div>}
        {note && <div className="ok-note">{note}</div>}

        <div className="team-grid">
          <section className="team-card glass">
            <h2>Doctors and admins</h2>
            <ul className="team-list">
              {team.map((a) => (
                <li key={a.id} className={a.active ? "" : "off"}>
                  <div className="who">
                    <b>{a.name}</b>
                    <small>
                      {a.role === "admin" ? "Admin" : a.specialty === "ent" ? "ENT" : cap(a.specialty || "general")} · {a.phone}
                      {a.active ? "" : " · switched off"}
                    </small>
                  </div>
                  <div className="acts">
                    {resetting?.id === a.id ? (
                      <form
                        className="reset-row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          reset(a, resetting.pw);
                        }}
                      >
                        <input
                          autoFocus
                          type="text"
                          aria-label={`New password for ${a.name}`}
                          placeholder="New password (6+)"
                          minLength={6}
                          value={resetting.pw}
                          onChange={(e) => setResetting({ id: a.id, pw: e.target.value })}
                        />
                        <button className="chip-btn" type="submit" disabled={resetting.pw.length < 6}>Save</button>
                        <button className="chip-btn" type="button" onClick={() => setResetting(null)}>Cancel</button>
                      </form>
                    ) : (
                      <button className="chip-btn" type="button" onClick={() => setResetting({ id: a.id, pw: "" })}>
                        Reset password
                      </button>
                    )}
                    <button
                      className="chip-btn"
                      type="button"
                      disabled={a.id === session?.account.id}
                      onClick={() => toggle(a)}
                      title={a.id === session?.account.id ? "You can't switch off your own account" : undefined}
                    >
                      {a.active ? "Switch off" : "Switch on"}
                    </button>
                  </div>
                </li>
              ))}
              {team.length === 0 && !error && <li className="muted">Loading…</li>}
            </ul>
          </section>

          <form className="team-card glass" onSubmit={add}>
            <h2>{form.role === "doctor" ? "Add a doctor" : "Add a hospital admin"}</h2>
            <label htmlFor="t-role">Role</label>
            <select id="t-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "doctor" | "admin" })}>
              <option value="doctor">Doctor</option>
              <option value="admin">Hospital admin</option>
            </select>
            <label htmlFor="t-name">Full name</label>
            <input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Kamran Ali" />
            <label htmlFor="t-phone">Phone (their login)</label>
            <input id="t-phone" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0300 1234567" />
            {form.role === "doctor" && (
              <>
                <label htmlFor="t-spec">Specialty</label>
                <select id="t-spec" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })}>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s === "ent" ? "ENT" : cap(s)}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label htmlFor="t-pass">First password (at least 6 letters)</label>
            <input id="t-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || form.name.trim().length < 2 || form.phone.trim().length < 6 || form.password.length < 6}
            >
              {busy ? "Adding…" : form.role === "doctor" ? "Add doctor" : "Add admin"}
            </button>
            <p className="muted" style={{ margin: 0, fontSize: "0.8125rem" }}>
              Doctors only see this hospital&apos;s desk. Every approval is signed with their own name.
            </p>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
