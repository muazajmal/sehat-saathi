"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell, { useStaff } from "./AppShell";
import { ago, api, ApiError, mapLink, type AmbulanceMember } from "../lib/api";

const STATUS_LABEL = { pending: "Needs checking", approved: "Approved", rejected: "Rejected", suspended: "Paused" };

export default function Ambulances() {
  const [staff, setStaff] = useStaff();
  const [list, setList] = useState<AmbulanceMember[]>([]);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.ambulances());
      setOnline(true);
    } catch (e) {
      setOnline(false);
      setError(e instanceof ApiError ? e.message : "Could not load ambulances.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(m: AmbulanceMember, decision: "approve" | "reject" | "suspend") {
    if (!staff.trim()) return setError("Add your name in the side bar first, so the log shows who decided.");
    setBusy(m.id);
    setError(null);
    try {
      await api.ambulanceReview(m.id, staff, decision, notes[m.id] ?? "");
      setToast(
        decision === "approve"
          ? `${m.driver_name} approved. They can go online now and will show up when you send help.`
          : decision === "reject"
            ? `${m.driver_name} rejected.`
            : `${m.driver_name} paused. They can't take trips until approved again.`,
      );
      setTimeout(() => setToast(null), 4000);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  const pending = list.filter((m) => m.status === "pending").length;
  const live = list.filter((m) => m.online).length;

  return (
    <AppShell staff={staff} onStaff={setStaff} online={online} joining={pending}>
      <header className="app-head">
        <div>
          <h1>Ambulances</h1>
          <p>
            Local ambulances who signed up on the website. {pending} waiting to be checked, {live} online now.
          </p>
        </div>
        <a className="btn btn-quiet" href="/ambulance/join" target="_blank" rel="noreferrer">
          Sign-up page ↗
        </a>
      </header>

      <div className="amb-wrap">
        <p className="amb-rule glass">
          Before approving, call the driver and check their <b>driving licence</b>, <b>vehicle registration</b> and <b>CNIC</b> in person.
          Approved ambulances appear in <b>Get to hospital</b> on a case, sorted by distance, whenever they are online.
        </p>
        {error && <div className="error">{error}</div>}
        {toast && <div className="toast-inline">{toast}</div>}
        {list.length === 0 && <p className="empty">No ambulances yet. Share the sign-up page with local drivers.</p>}

        <ul className="amb-list">
          {list.map((m) => (
            <li key={m.id} className={`amb glass s-${m.status}`}>
              <div className="amb-top">
                <div>
                  <strong dir="auto">{m.driver_name}</strong>
                  {m.organisation && <span className="muted" dir="auto"> · {m.organisation}</span>}
                  <div className="muted small">
                    {m.vehicle} · <span className="mono">{m.vehicle_reg}</span> · {m.area}
                  </div>
                </div>
                <span className={`amb-badge b-${m.status}`}>
                  {m.status === "approved" ? (m.busy ? "On a trip" : m.online ? "Online" : "Offline") : STATUS_LABEL[m.status]}
                </span>
              </div>
              <div className="amb-meta small muted">
                <a href={`tel:${m.phone}`}>{m.phone}</a> · signed up {ago(m.created_at)}
                {m.last_seen_at && <> · last seen {ago(m.last_seen_at)}</>} ·{" "}
                <a href={mapLink(m.lat, m.lng)} target="_blank" rel="noreferrer">
                  map
                </a>
                {m.reviewed_by && (
                  <>
                    {" "}
                    · {STATUS_LABEL[m.status].toLowerCase()} by {m.reviewed_by}
                    {m.review_note ? `: ${m.review_note}` : ""}
                  </>
                )}
              </div>
              <div className="amb-actions">
                <input
                  placeholder="Note (e.g. papers checked)"
                  value={notes[m.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })}
                  aria-label={`Note for ${m.driver_name}`}
                />
                {m.status !== "approved" && (
                  <button className="btn btn-primary" disabled={busy === m.id} onClick={() => decide(m, "approve")}>
                    Approve
                  </button>
                )}
                {m.status === "pending" && (
                  <button className="btn btn-quiet" disabled={busy === m.id} onClick={() => decide(m, "reject")}>
                    Reject
                  </button>
                )}
                {m.status === "approved" && (
                  <button className="btn btn-quiet" disabled={busy === m.id || m.busy} onClick={() => decide(m, "suspend")}>
                    Pause
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
