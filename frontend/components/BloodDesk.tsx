"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { BLOOD_GROUPS, cx, type BloodGroup, type BloodRequestT } from "../lib/community";
import AppShell, { useStaff } from "./AppShell";

type Summary = Awaited<ReturnType<typeof cx.donorsSummary>>;

export default function BloodDesk() {
  const [staff, setStaff] = useStaff();
  const [s, setS] = useState<Summary | null>(null);
  const [form, setForm] = useState({ blood_group: "O+" as BloodGroup, units: 1, hospital_id: "nishtar", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => cx.donorsSummary().then(setS).catch((e) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <AppShell staff={staff} onStaff={setStaff}>
      <div className="team">
        <header>
          <h1 style={{ margin: 0 }}>Blood donors</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Local volunteers by blood group. Ask the nearest matching donors; their numbers appear only after they say yes.
          </p>
        </header>
        {error && <div className="error">{error}</div>}
        {s && (
          <div className="blood-groups">
            {BLOOD_GROUPS.map((g) => (
              <div key={g} className="bg-tile"><b>{g}</b><span>{s.by_group[g] ?? 0} ready</span></div>
            ))}
          </div>
        )}
        <div className="team-grid">
          <section className="team-card glass">
            <h2>Requests</h2>
            {s?.requests.length === 0 && <p className="muted">No requests yet.</p>}
            {s?.requests.map((r) => <Request key={r.id} r={r} onChange={load} />)}
          </section>
          <form
            className="team-card glass"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await cx.bloodRequest(form);
                setForm({ ...form, note: "" });
                await load();
              } catch (x) {
                setError(x instanceof ApiError ? x.message : String(x));
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Ask donors for blood</h2>
            <label>Patient's blood group</label>
            <div className="chips">
              {BLOOD_GROUPS.map((g) => (
                <button key={g} type="button" className="chip-btn" aria-pressed={form.blood_group === g} onClick={() => setForm({ ...form, blood_group: g })}>{g}</button>
              ))}
            </div>
            <label htmlFor="b-units">Units needed</label>
            <input id="b-units" type="number" min={1} max={10} value={form.units} onChange={(e) => setForm({ ...form, units: Number(e.target.value) || 1 })} />
            <label htmlFor="b-h">Hospital</label>
            <select id="b-h" value={form.hospital_id} onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}>
              {s?.hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <label htmlFor="b-note">Note for the blood bank (not shown to donors)</label>
            <input id="b-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Asking…" : `Ask nearby donors for ${form.blood_group}`}</button>
            <p className="muted" style={{ margin: 0, fontSize: "0.8125rem" }}>
              Only donors whose blood suits the patient and who haven&apos;t given blood in the last 3 months are asked, nearest first.
            </p>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

function Request({ r, onChange }: { r: BloodRequestT; onChange: () => void }) {
  const ans = { waiting: "⏳ waiting", yes: "✅ yes", no: "✕ no", donated: "🩸 donated" };
  return (
    <div className={`blood-req ${r.status}`}>
      <div className="br-head">
        <span className="donor-badge small">{r.blood_group}</span>
        <div className="who">
          <b>{r.units} unit(s) · {r.hospital.replace(/\(.*\)/, "")}</b>
          <small>{r.yes} said yes of {r.asks.length} asked · by {r.created_by} · {r.status}</small>
        </div>
        {r.status === "open" && (
          <button className="chip-btn" onClick={async () => { await cx.bloodStatus(r.id, "filled"); onChange(); }}>Mark filled</button>
        )}
      </div>
      <ul className="team-list">
        {r.asks.slice(0, 8).map((a) => (
          <li key={a.id} className={a.answer === "yes" ? "yes" : ""}>
            <div className="who">
              <b>{a.donor} <span className="muted">({a.blood_group})</span></b>
              <small>{a.area}{a.km != null ? ` · ${a.km} km` : ""}{a.phone ? ` · ${a.phone}` : ""}</small>
            </div>
            <div className="acts">
              <span className={`ans ${a.answer}`}>{ans[a.answer]}</span>
              {a.phone && <a className="chip-btn" href={`tel:${a.phone}`}>Call</a>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
