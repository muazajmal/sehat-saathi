"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell, { useStaff } from "./AppShell";
import { api, apiCall, ApiError, toDate, type ScheduleSlot } from "../lib/api";

function dayKey(offset: number) {
  // Clinic-local date (PKT) regardless of the viewer's timezone.
  const d = new Date(Date.now() + 5 * 3600 * 1000 + offset * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

const DAYS = [
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
  { label: "Day after", offset: 2 },
];

const initials = (name: string) =>
  name
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export default function Schedule() {
  const [staff, setStaff] = useStaff();
  const [offset, setOffset] = useState(0);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      setSlots(await api.schedule(dayKey(offset)));
      setOnline(true);
      setError(null);
    } catch (e) {
      setOnline(false);
      setError(e instanceof ApiError ? e.message : "Could not load the schedule.");
    } finally {
      setLoaded(true);
    }
  }, [offset]);

  async function mark(caseId: number, value: "arrived" | "no_show") {
    try {
      await apiCall(`/api/cases/${caseId}/attendance`, { method: "POST", body: JSON.stringify({ value }) });
      await load();
    } catch {
      /* the next refresh shows the current state */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const byDoctor = useMemo(() => {
    const m = new Map<string, ScheduleSlot[]>();
    for (const s of slots) m.set(s.doctor, [...(m.get(s.doctor) ?? []), s]);
    return [...m.entries()];
  }, [slots]);

  const booked = slots.filter((s) => s.status === "booked").length;
  const held = slots.filter((s) => s.status === "held").length;
  const free = slots.filter((s) => s.status === "open").length;

  return (
    <AppShell staff={staff} onStaff={setStaff} online={online}>
      <header className="app-head">
        <div>
          <h1>Schedule</h1>
          <p>
            {booked} booked, {held} held by the AI waiting for approval, {free} free.
          </p>
        </div>
        <div className="sched-tools" role="group" aria-label="Choose a day">
          {DAYS.map((d) => (
            <button key={d.offset} aria-pressed={offset === d.offset} onClick={() => setOffset(d.offset)}>
              {d.label}
            </button>
          ))}
        </div>
      </header>

      <div className="legend">
        <span>
          <i style={{ background: "var(--teal-soft)", border: "1px solid rgba(95,227,196,.45)" }} /> Booked by a doctor
        </span>
        <span>
          <i style={{ background: "var(--today-bg)", border: "1px dashed rgba(255,194,102,.6)" }} /> Held by AI, needs approval
        </span>
        <span>
          <i style={{ border: "1px solid var(--line-strong)" }} /> Free
        </span>
      </div>

      {error && (
        <div style={{ padding: "0 32px 16px" }}>
          <div className="error">{error}</div>
        </div>
      )}

      <div className="sched">
        {byDoctor.map(([doctor, list]) => (
          <section key={doctor} className="sched-col glass" aria-label={doctor}>
            <header>
              <span className="avatar">{initials(doctor)}</span>
              <div>
                <strong>{doctor}</strong>
                <small>{list[0]?.specialty}</small>
              </div>
            </header>
            <ol>
              {list.map((s) => {
                const time = toDate(s.starts_at).toLocaleTimeString("en-GB", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                });
                const body = (
                  <>
                    <time dateTime={s.starts_at}>{time}</time>
                    <span className="who">
                      {s.status === "open" ? "Free" : s.patient ?? "Reserved"}
                    </span>
                    {s.urgency && <span className={`tag tag-${s.urgency}`} aria-label={s.urgency} style={{ padding: "2px 6px" }} />}
                    {s.patient_reply === "coming" && !s.attendance && <span className="reply-ok" title="Patient said they'll come">✓ coming</span>}
                  </>
                );
                return (
                  <li key={s.id}>
                    {s.case_id ? (
                      <Link href={`/desk?case=${s.case_id}`} className={`sslot s-${s.status}`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={`sslot s-${s.status}`}>{body}</div>
                    )}
                    {s.status === "booked" && s.case_id && offset === 0 && (
                      <div className="att">
                        {s.attendance ? (
                          <span className={`att-done ${s.attendance}`}>{s.attendance === "arrived" ? "✓ Arrived" : "✕ No-show"}</span>
                        ) : (
                          <>
                            <button type="button" onClick={() => mark(s.case_id!, "arrived")}>Arrived</button>
                            <button type="button" onClick={() => mark(s.case_id!, "no_show")}>No-show</button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {loaded && !error && byDoctor.length === 0 && (
          <div className="glass panel empty">No slots left for this day. Pick another day above.</div>
        )}
      </div>
    </AppShell>
  );
}
