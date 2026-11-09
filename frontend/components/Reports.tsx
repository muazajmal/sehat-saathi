"use client";

import { useCallback, useEffect, useState } from "react";
import { API, apiCall, session, staffCode } from "../lib/api";
import AppShell, { useStaff } from "./AppShell";

interface Report {
  hospital: string;
  days: number;
  from: string;
  to: string;
  totals: {
    requests: number; urgent: number; today: number; routine: number; pending: number; approved: number; declined: number;
    median_decision_min: number | null; median_urgent_decision_min: number | null; booked: number; arrived: number;
    no_show: number; cancelled: number; confirmed: number; no_show_rate: number | null; ai_triaged: number;
  };
  series: { day: string; requests: number; urgent: number }[];
  complaints: { key: string; name: string; count: number }[];
  channels: Record<string, number>;
  languages: Record<string, number>;
  hours: number[];
  doctors: { doctor: string; booked: number; arrived: number; no_show: number }[];
  areas: { area: string; count: number }[];
}

const LANG: Record<string, string> = { ur: "Urdu", roman_ur: "Roman Urdu", en: "English", pa: "Punjabi", skr: "Saraiki",
  ps: "Pashto", sd: "Sindhi", bal: "Balochi", ar: "Arabic", fa: "Persian" };
const mins = (m: number | null) => (m == null ? "–" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");

function Bars({ data, height = 120 }: { data: { label: string; a: number; b?: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.a));
  const w = Math.max(6, Math.min(28, 640 / data.length - 4));
  const W = data.length * (w + 4);
  return (
    <svg className="rep-bars" viewBox={`0 0 ${W} ${height + 18}`} preserveAspectRatio="none" role="img"
      aria-label={data.map((d) => `${d.label}: ${d.a}`).join(", ")}>
      {data.map((d, i) => {
        const h = (d.a / max) * height;
        const hb = ((d.b ?? 0) / max) * height;
        return (
          <g key={i} transform={`translate(${i * (w + 4)} 0)`}>
            <title>{`${d.label}: ${d.a}${d.b != null ? `, urgent ${d.b}` : ""}`}</title>
            <rect y={height - h} width={w} height={Math.max(h, d.a ? 2 : 0)} rx="3" className="bar-a" />
            {d.b != null && d.b > 0 && <rect y={height - hb} width={w} height={hb} rx="3" className="bar-b" />}
          </g>
        );
      })}
    </svg>
  );
}

function HBar({ rows }: { rows: { name: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="hbar">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="hb-name">{r.name}</span>
          <span className="hb-track"><span style={{ width: `${(100 * r.n) / max}%` }} /></span>
          <b>{r.n}</b>
        </li>
      ))}
    </ul>
  );
}

export default function Reports() {
  const [staff, setStaff] = useStaff();
  const [days, setDays] = useState(30);
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setR(await apiCall<Report>(`/api/reports?days=${days}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  async function downloadCsv() {
    const tok = session.get()?.token;
    const code = staffCode.get();
    const res = await fetch(`${API}/api/reports/cases.csv?days=${days}`, {
      headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(code ? { "X-Staff-Key": code } : {}) },
    });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `sehat-saathi-cases-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const T = r?.totals;
  const period = r ? `${new Date(r.from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(r.to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "";
  return (
    <AppShell staff={staff} onStaff={setStaff}>
      <div className="team reports">
        <header className="rep-head">
          <div>
            <h1 style={{ margin: 0 }}>Reports</h1>
            <p className="muted" style={{ margin: "4px 0 0" }}>{r ? `${r.hospital} · ${period}` : "Loading…"}</p>
          </div>
          <div className="rep-actions no-print">
            {[7, 30, 90].map((d) => (
              <button key={d} className="chip-btn" aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>
            ))}
            <button className="chip-btn" onClick={downloadCsv}>Download CSV</button>
            <button className="btn btn-primary" onClick={() => window.print()}>Monthly report (PDF)</button>
          </div>
        </header>
        {error && <div className="error">{error}</div>}
        {r && T && (
          <>
            <div className="kpis">
              <div className="kpi"><b>{T.requests}</b><span>requests</span></div>
              <div className="kpi urgent"><b>{T.urgent}</b><span>urgent ({pct(T.urgent, T.requests)})</span></div>
              <div className="kpi"><b>{mins(T.median_decision_min)}</b><span>median time to a doctor&apos;s decision</span></div>
              <div className="kpi"><b>{mins(T.median_urgent_decision_min)}</b><span>for urgent cases</span></div>
              <div className="kpi"><b>{T.booked}</b><span>appointments booked</span></div>
              <div className={`kpi ${T.no_show_rate != null && T.no_show_rate > 20 ? "urgent" : ""}`}>
                <b>{T.no_show_rate == null ? "–" : `${T.no_show_rate}%`}</b><span>no-show rate ({T.no_show} of {T.arrived + T.no_show} marked)</span>
              </div>
              <div className="kpi"><b>{T.confirmed}</b><span>patients confirmed &quot;I&apos;ll come&quot;</span></div>
              <div className="kpi"><b>{T.cancelled}</b><span>cancelled ahead (slots given to others)</span></div>
            </div>

            <section className="team-card glass">
              <h2>Requests per day <small className="muted">· urgent in red</small></h2>
              <Bars data={r.series.map((d) => ({ label: d.day, a: d.requests, b: d.urgent }))} />
              <div className="rep-axis"><span>{r.series[0]?.day}</span><span>{r.series[r.series.length - 1]?.day}</span></div>
            </section>

            <div className="team-grid">
              <section className="team-card glass">
                <h2>Top complaints</h2>
                <HBar rows={r.complaints.map((c) => ({ name: c.name, n: c.count }))} />
              </section>
              <section className="team-card glass">
                <h2>How they reached you</h2>
                <HBar rows={[
                  ...Object.entries(r.channels).map(([k, n]) => ({ name: k === "web" ? "Website / app" : k[0].toUpperCase() + k.slice(1), n })),
                ]} />
                <h2 style={{ marginTop: 10 }}>Languages</h2>
                <HBar rows={Object.entries(r.languages).map(([k, n]) => ({ name: LANG[k] ?? k, n }))} />
              </section>
            </div>

            <div className="team-grid">
              <section className="team-card glass">
                <h2>Doctors</h2>
                <table className="rep-table">
                  <thead><tr><th>Doctor</th><th>Booked</th><th>Arrived</th><th>No-show</th></tr></thead>
                  <tbody>
                    {r.doctors.map((d) => (
                      <tr key={d.doctor}><td>{d.doctor}</td><td>{d.booked}</td><td>{d.arrived}</td><td>{d.no_show}</td></tr>
                    ))}
                    {r.doctors.length === 0 && <tr><td colSpan={4} className="muted">No bookings yet.</td></tr>}
                  </tbody>
                </table>
              </section>
              <section className="team-card glass">
                <h2>Busiest hours</h2>
                <Bars data={r.hours.map((n, h) => ({ label: `${h}:00`, a: n }))} height={90} />
                <div className="rep-axis"><span>12 am</span><span>12 pm</span><span>11 pm</span></div>
                {r.areas.length > 0 && (
                  <>
                    <h2 style={{ marginTop: 10 }}>Where patients are</h2>
                    <HBar rows={r.areas.map((a) => ({ name: a.area, n: a.count }))} />
                  </>
                )}
              </section>
            </div>
            <p className="muted small">
              {T.ai_triaged} of {T.requests} requests were read by AI; every booking was decided by a doctor. Patient names and phone
              numbers are not included in reports or the CSV.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
