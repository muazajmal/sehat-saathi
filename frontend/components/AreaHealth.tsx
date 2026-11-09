"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { cx, type AreaAlertT, type AreaHealth as AH, type Rise } from "../lib/community";
import AppShell, { useStaff } from "./AppShell";

function AreaMap({ data, focus, onPick }: { data: AH; focus: string | null; onPick: (a: string) => void }) {
  const W = 520, H = 420;
  const lats = data.areas.map((a) => a.lat), lngs = data.areas.map((a) => a.lng);
  const [la0, la1, ln0, ln1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const k = Math.cos((30.2 * Math.PI) / 180);
  const s = Math.min((W - 120) / ((ln1 - ln0) * k), (H - 110) / (la1 - la0));
  const P = (lat: number, lng: number) => ({ x: 60 + (lng - ln0) * k * s, y: H - 55 - (lat - la0) * s });
  const rising = new Map(data.rises.map((r) => [r.area, r]));
  const max = Math.max(1, ...data.map.map((m) => m.cases));
  return (
    <svg className="area-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cases this week by area, Multan">
      <defs>
        <pattern id="am-grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="rgba(150,230,210,.06)" /></pattern>
      </defs>
      <rect width={W} height={H} rx="16" fill="#061413" />
      <rect width={W} height={H} rx="16" fill="url(#am-grid)" />
      <g stroke="rgba(150,230,210,.08)" strokeWidth="9" fill="none" strokeLinecap="round">
        <path d="M-10 150 C 140 130, 300 210, 530 170" /><path d="M200 -10 C 230 140, 190 280, 240 430" /><path d="M-10 330 C 160 300, 340 360, 530 300" />
      </g>
      {data.map.map((m) => {
        const p = P(m.lat, m.lng);
        const r = rising.get(m.area);
        const rad = 10 + 26 * Math.sqrt(m.cases / max);
        const col = r ? (r.level === "alert" ? "#ff7a83" : "#f5b14c") : "#5fe3c4";
        return (
          <g key={m.area} transform={`translate(${p.x} ${p.y})`} className={`am-dot${focus === m.area ? " focus" : ""}`} onClick={() => onPick(m.area)} style={{ cursor: "pointer" }}>
            {r && <circle r={rad} fill="none" stroke={col} strokeWidth="2" className="am-ring" />}
            <circle r={rad} fill={col} fillOpacity={r ? 0.35 : 0.16} stroke={col} strokeOpacity=".8" />
            <text textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="700" fill="#eaf5f2">{m.cases}</text>
            <text y={m.area.startsWith("Hussain") ? -rad - 6 : rad + 13} textAnchor="middle" fontSize="11" fill="#9fbab4">
              {m.area.replace(" Colony", "").replace(" / Old City", "")}
            </text>
          </g>
        );
      })}
      <g transform={`translate(16 ${H - 18})`} fontSize="11" fill="#9fbab4">
        <circle r="5" cx="6" cy="-4" fill="#ff7a83" /><text x="16">Alert</text>
        <circle r="5" cx="66" cy="-4" fill="#f5b14c" /><text x="76">Watch</text>
        <circle r="5" cx="132" cy="-4" fill="#5fe3c4" fillOpacity=".5" /><text x="142">Cases this week (with location)</text>
      </g>
    </svg>
  );
}

function Spark({ v }: { v: number[] }) {
  const m = Math.max(1, ...v);
  return (
    <svg className="spark" viewBox="0 0 70 22" aria-label={`Last 7 days: ${v.join(", ")}`}>
      {v.map((n, i) => <rect key={i} x={i * 10} y={22 - (n / m) * 20} width="7" height={(n / m) * 20 + 1} rx="1.5" fill="currentColor" />)}
    </svg>
  );
}

export default function AreaHealth() {
  const [staff, setStaff] = useStaff();
  const [data, setData] = useState<AH | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [edit, setEdit] = useState<AreaAlertT | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => cx.areaHealth().then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { load(); }, [load]);

  async function draft(r: Rise) {
    setBusy(true);
    try {
      setEdit(r.alert ?? (await cx.draftAlert(r.area, r.group)));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!edit) return;
    setBusy(true);
    try {
      await cx.editAlert(edit.id, edit);
      const p = await cx.publishAlert(edit.id);
      setToast(`Sent: ${p.title_en}. ${p.reached ?? 0} people in ${p.area} told; it's on the public alerts page.`);
      setEdit(null);
      await load();
      setTimeout(() => setToast(null), 6000);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = data?.rises.filter((r) => !focus || r.area === focus) ?? [];
  return (
    <AppShell staff={staff} onStaff={setStaff}>
      <div className="team">
        <header>
          <h1 style={{ margin: 0 }}>Area health</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Illness rising in a neighbourhood this week, compared with the 4 weeks before. You approve every alert before anyone sees it.
          </p>
        </header>
        {error && <div className="error">{error}</div>}
        {toast && <div className="ok-note">{toast}</div>}
        {!data ? <p className="muted">Loading…</p> : (
          <div className="team-grid">
            <section className="team-card glass">
              <h2>Multan: cases this week {focus && <button className="chip-btn" onClick={() => setFocus(null)}>Show all</button>}</h2>
              <AreaMap data={data} focus={focus} onPick={setFocus} />
            </section>
            <section className="team-card glass">
              <h2>Rising now</h2>
              {shown.length === 0 && <p className="muted">Nothing unusual{focus ? ` in ${focus}` : ""}.</p>}
              <ul className="team-list">
                {shown.map((r) => (
                  <li key={r.area + r.group} className={`rise ${r.level}`}>
                    <div className="who">
                      <b>{r.group_en} · {r.area}</b>
                      <small>{r.cases_week} this week, usually {r.baseline_week} ({r.ratio}×)</small>
                    </div>
                    <Spark v={r.daily} />
                    <div className="acts">
                      <span className={`lvl ${r.level}`}>{r.level === "alert" ? "Alert" : "Watch"}</span>
                      {r.alert?.status === "published" ? <span className="lvl sent">Sent</span> :
                        <button className="chip-btn" disabled={busy} onClick={() => draft(r)}>{r.alert ? "Review alert" : "Draft alert"}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {edit && (
          <section className="team-card glass">
            <h2>Alert for {edit.area}: check the wording</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Drafted by {edit.drafted_by === "template" ? "a template" : `AI (${edit.drafted_by})`} from {edit.cases_week} cases. Edit anything, then approve.
            </p>
            <div className="alert-edit">
              <div>
                <label>Title (English)</label>
                <input value={edit.title_en} onChange={(e) => setEdit({ ...edit, title_en: e.target.value })} />
                <label>Message (English)</label>
                <textarea rows={6} value={edit.body_en} onChange={(e) => setEdit({ ...edit, body_en: e.target.value })} />
              </div>
              <div dir="rtl">
                <label>عنوان (اردو)</label>
                <input className="urdu" value={edit.title_ur} onChange={(e) => setEdit({ ...edit, title_ur: e.target.value })} />
                <label>پیغام (اردو)</label>
                <textarea className="urdu" rows={6} value={edit.body_ur} onChange={(e) => setEdit({ ...edit, body_ur: e.target.value })} />
              </div>
            </div>
            <div className="acts" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={busy} onClick={publish}>{busy ? "Sending…" : "Approve and send to the area"}</button>
              <button className="btn btn-quiet" onClick={() => setEdit(null)}>Not now</button>
            </div>
          </section>
        )}

        {data && data.alerts.some((a) => a.status === "published") && (
          <section className="team-card glass">
            <h2>Sent alerts</h2>
            <ul className="team-list">
              {data.alerts.filter((a) => a.status === "published").map((a) => (
                <li key={a.id}>
                  <div className="who"><b>{a.title_en}</b><small>Approved by {a.approved_by} · until {a.expires_at && new Date(a.expires_at).toLocaleDateString()}</small></div>
                  <div className="acts">
                    <a className="chip-btn" href={`/alerts#a${a.id}`} target="_blank" rel="noreferrer">View</a>
                    <button className="chip-btn" onClick={async () => { await cx.closeAlert(a.id); load(); }}>End</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
