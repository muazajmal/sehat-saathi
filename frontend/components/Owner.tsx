"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiCall, ApiError } from "../lib/api";
import { useSession } from "../lib/useSession";
import Logo from "./Logo";

interface TenantRow {
  id: number; slug: string; name: string; city: string; address: string; phone: string;
  status: "pending" | "active" | "suspended"; created_at: string; staff: number; cases_30d: number; admin: string;
}

/** The Sehat Saathi owner: approve hospitals that apply, pause any of them. First visit: claim the owner account. */
export default function Owner() {
  const { session, ready, save, logout } = useSession();
  const [exists, setExists] = useState<boolean | null>(null);
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [f, setF] = useState({ name: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const isOwner = session?.account.role === "owner";

  const load = useCallback(() => apiCall<TenantRow[]>("/api/owner/tenants").then(setRows).catch((e) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => {
    apiCall<{ exists: boolean }>("/api/owner/exists").then((r) => setExists(r.exists)).catch(() => setExists(true));
  }, []);
  useEffect(() => {
    if (ready && isOwner) load();
  }, [ready, isOwner, load]);

  if (!ready || exists === null) return <p className="empty">Loading…</p>;

  if (!isOwner && !exists)
    return (
      <main className="gate">
        <form className="gate-card glass" onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            save(await apiCall("/api/owner/claim", { method: "POST", body: JSON.stringify(f) }));
          } catch (x) {
            setError(x instanceof ApiError ? x.message : String(x));
          }
        }}>
          <Logo />
          <h1>Set up the owner account</h1>
          <p>One time only. The owner approves hospitals that apply. After this, this page only accepts the owner&apos;s login.</p>
          <label htmlFor="o-name">Your name</label>
          <input id="o-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <label htmlFor="o-phone">Your mobile</label>
          <input id="o-phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <label htmlFor="o-pass">Password (at least 8 characters)</label>
          <input id="o-pass" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={f.name.trim().length < 2 || f.phone.trim().length < 6 || f.password.length < 8}>
            Create owner account
          </button>
        </form>
      </main>
    );

  if (!isOwner)
    return (
      <main className="gate">
        <div className="gate-card glass">
          <Logo />
          <h1>Owner</h1>
          <p>Log in with the owner account through the hospital login.</p>
          <Link className="btn btn-primary" href="/login?as=staff">Hospital login</Link>
        </div>
      </main>
    );

  const set = async (id: number, status: "active" | "suspended") => {
    try {
      await apiCall(`/api/owner/tenants/${id}/status?status=${status}`, { method: "POST" });
      load();
    } catch (x) {
      setError(x instanceof ApiError ? x.message : String(x));
    }
  };
  const pending = rows?.filter((r) => r.status === "pending") ?? [];
  return (
    <main className="owner">
      <header className="owner-head">
        <Logo />
        <span className="muted">Owner · {session!.account.name}</span>
        <button className="chip-btn" onClick={logout}>Log out</button>
      </header>
      <h1>Hospitals</h1>
      <p className="muted">
        {rows?.filter((r) => r.status === "active").length ?? 0} live · {pending.length} waiting for approval. Hospitals apply at{" "}
        <Link href="/hospitals/join">/hospitals/join</Link>.
      </p>
      {error && <div className="error">{error}</div>}
      <ul className="team-list owner-list">
        {rows?.map((r) => (
          <li key={r.id} className={r.status}>
            <div className="who">
              <b>{r.name} <span className={`lvl ${r.status === "active" ? "sent" : r.status === "pending" ? "watch" : "alert"}`}>{r.status}</span></b>
              <small>{r.city} · {r.phone || "no phone"} · admin {r.admin || "–"} · {r.staff} staff · {r.cases_30d} requests in 30 days · patient link /patient?h={r.slug}</small>
            </div>
            <div className="acts">
              {r.status !== "active" && <button className="btn btn-primary" onClick={() => set(r.id, "active")}>{r.status === "pending" ? "Approve" : "Turn on"}</button>}
              {r.status === "active" && r.id !== 1 && <button className="chip-btn" onClick={() => set(r.id, "suspended")}>Pause</button>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
