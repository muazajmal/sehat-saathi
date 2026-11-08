"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell, { useStaff } from "./AppShell";
import {
  ago,
  api,
  ApiError,
  languageLabel,
  scriptClass,
  slotTime,
  toDate,
  URGENCY_LABEL,
  type AuditEvent,
  type Case,
  type CaseStatus,
  type Slot,
  type Stats,
} from "../lib/api";

const TABS: { id: CaseStatus; label: string }[] = [
  { id: "pending_review", label: "Waiting" },
  { id: "approved", label: "Booked" },
  { id: "rejected", label: "Declined" },
];

const ACTION_LABEL: Record<string, string> = {
  triaged: "Triaged",
  slot_held: "Held a slot",
  escalated: "Alerted duty doctor",
  escalation_pending: "Call-back needed (alert not sent)",
  approved: "Approved booking",
  rejected: "Declined",
  called_back: "Called patient back",
};

export default function Desk() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("case") ? Number(params.get("case")) : null;

  const [tab, setTab] = useState<CaseStatus>("pending_review");
  const [cases, setCases] = useState<Case[]>([]);
  const [selected, setSelected] = useState<Case | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [online, setOnline] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staff, setStaff] = useStaff();
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([api.cases(tab), api.stats()]);
      setCases(list);
      setStats(s);
      setOnline(true);
      setLoadError(null);
    } catch (e) {
      setOnline(false);
      setLoadError(e instanceof ApiError ? e.message : "Could not load the queue.");
    }
  }, [tab]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // Keep the open case fresh, even if it is not in the current tab.
  useEffect(() => {
    if (selectedId == null) {
      setSelected(null);
      return;
    }
    const inList = cases.find((c) => c.id === selectedId);
    if (inList) {
      setSelected(inList);
      return;
    }
    api.cases("all").then((all) => setSelected(all.find((c) => c.id === selectedId) ?? null)).catch(() => {});
  }, [selectedId, cases]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const select = (id: number | null) => router.replace(id == null ? "/desk" : `/desk?case=${id}`, { scroll: false });

  const onDecided = (c: Case, message: string) => {
    setToast(message);
    setSelected(c);
    refresh();
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? cases.filter((c) =>
        [c.patient.name, c.patient.phone, c.summary, c.message].some((f) => f?.toLowerCase().includes(q)),
      )
    : cases;

  return (
    <AppShell staff={staff} onStaff={setStaff} online={online} urgent={stats?.urgent_pending ?? 0}>
      <header className="app-head">
        <div>
          <h1>Patient queue</h1>
          <p>Every WhatsApp message, sorted by urgency. Nothing is booked until you approve it.</p>
        </div>
      </header>

      <div className="statline" aria-label="Today at a glance">
        <Stat value={stats?.pending} label="Waiting for review" />
        <Stat value={stats?.urgent_pending} label="Urgent waiting" alarm={!!stats?.urgent_pending} />
        <Stat value={stats?.callbacks_open} label="Call-backs open" alarm={!!stats?.callbacks_open} />
        <Stat value={stats?.approved_today} label="Booked today" />
        <Stat value={stats?.open_slots_today} label="Free slots today" />
        <Stat
          value={stats?.avg_review_minutes == null ? "–" : `${stats.avg_review_minutes} min`}
          label="Average review time"
        />
      </div>

      <div className={`desk-main${selectedId != null ? " has-selection" : ""}`}>
        <aside className="queue glass" aria-label="Patient queue">
          <div className="queue-tools">
            <input
              className="search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone or symptom"
              aria-label="Search the queue"
            />
          </div>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {loadError && (
            <div style={{ padding: 12 }}>
              <div className="error">{loadError}</div>
            </div>
          )}
          <ul>
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  className={`qitem u-${c.urgency}`}
                  aria-current={c.id === selectedId}
                  onClick={() => select(c.id)}
                >
                  <div className="qrow">
                    <span className="qname">{c.patient.name || c.patient.phone}</span>
                    <span className="qtime">{ago(c.created_at)}</span>
                  </div>
                  <p className="qsum">{c.summary}</p>
                  <div className="qrow">
                    <span className={`tag tag-${c.urgency}`}>{URGENCY_LABEL[c.urgency]}</span>
                    {c.needs_callback && !c.called_back && <span className="callback-flag">Call back</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {!loadError && visible.length === 0 && (
            <p className="empty">
              {q
                ? "No patients match that search."
                : tab === "pending_review"
                  ? "No one is waiting. New WhatsApp messages appear here within seconds."
                  : "Nothing here yet."}
            </p>
          )}
        </aside>

        <section className="detail" aria-label="Case detail">
          {selected ? (
            <CaseDetail key={selected.id} c={selected} staff={staff} onBack={() => select(null)} onDecided={onDecided} />
          ) : (
            <div className="glass panel empty">Pick a patient from the queue. Urgent cases are always at the top.</div>
          )}
        </section>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </AppShell>
  );
}

function Stat({ value, label, alarm }: { value: number | string | undefined; label: string; alarm?: boolean }) {
  return (
    <div className={`stat glass${alarm ? " alarm" : ""}`}>
      <b>{value ?? "–"}</b>
      <span>{label}</span>
    </div>
  );
}

function CaseDetail({
  c,
  staff,
  onBack,
  onDecided,
}: {
  c: Case;
  staff: string;
  onBack: () => void;
  onDecided: (c: Case, msg: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotId, setSlotId] = useState<number | null>(c.proposed_slot?.id ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<AuditEvent[]>([]);
  const pending = c.status === "pending_review";

  useEffect(() => {
    if (pending) api.slots(3).then(setSlots).catch(() => {});
  }, [pending]);

  useEffect(() => {
    api.audit(c.id).then(setLog).catch(() => {});
  }, [c.id, c.status, c.called_back]);

  const slotOptions = useMemo(() => {
    const list = c.proposed_slot && pending ? [c.proposed_slot, ...slots] : slots;
    return list.filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);
  }, [slots, c.proposed_slot, pending]);

  const needStaff = !staff.trim() ? "Add your name in the top bar first, so the log shows who decided." : null;

  async function run(action: () => Promise<Case>, msg: string) {
    if (needStaff) {
      setError(needStaff);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDecided(await action(), msg);
      setNote("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const messageScript = scriptClass(c.message, c.language);
  const replyScript = scriptClass(c.reply_ur, c.language);

  return (
    <div className="detail-inner">
      <button className="btn btn-quiet back" onClick={onBack}>
        Back to queue
      </button>

      <div className="detail-head">
        <h2>{c.patient.name || "Unknown patient"}</h2>
        <span className={`tag tag-${c.urgency}`}>{URGENCY_LABEL[c.urgency]}</span>
      </div>
      <p className="meta">
        {c.patient.phone}, via {c.channel === "web" ? "web demo" : c.channel}, {ago(c.created_at)}
      </p>

      {c.needs_callback && (
        <div className={`callback${c.called_back ? " done" : ""}`}>
          <p>{c.called_back ? "Patient was called back." : "Danger signs. Call this patient now."}</p>
          {!c.called_back && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <a className="btn btn-danger" href={`tel:${c.patient.phone}`}>
                Call {c.patient.phone}
              </a>
              <button
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => run(() => api.called(c.id, staff, note), "Call-back logged")}
              >
                Log call-back
              </button>
            </div>
          )}
        </div>
      )}

      <div className="panel glass">
        <h3>
          Patient&apos;s message <span className="lang-chip">{languageLabel(c.language)}</span>
        </h3>
        <p className={`quote${messageScript ? ` ${messageScript}` : ""}`} dir={messageScript ? "rtl" : "auto"}>
          {c.message}
        </p>
      </div>

      <div className="panel glass ai-panel">
        <h3>AI suggestion, not a diagnosis</h3>
        <p className="summary">{c.summary}</p>
        {c.red_flags.length > 0 && (
          <div className="flags">
            {c.red_flags.map((f) => (
              <span key={f} className="flag">
                {f}
              </span>
            ))}
          </div>
        )}
        <span className="engine">
          Suggested {URGENCY_LABEL[c.urgency].toLowerCase()} for {c.specialty} by {c.engine}, confidence{" "}
          {Math.round(c.confidence * 100)}%
        </span>
        <div className="reply-preview">
          <h3>Reply already sent to the patient, in {languageLabel(c.language)}</h3>
          <p className={replyScript} dir={replyScript ? "rtl" : "auto"}>
            {c.reply_ur}
          </p>
        </div>
      </div>

      {pending ? (
        <div className="panel glass decide">
          <h3>Your decision</h3>
          <label htmlFor="slot">Appointment</label>
          <select id="slot" value={slotId ?? ""} onChange={(e) => setSlotId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose a slot</option>
            {slotOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {slotTime(s.starts_at)}, {s.doctor}
                {s.id === c.proposed_slot?.id ? " (held by AI)" : ""}
              </option>
            ))}
          </select>
          <label htmlFor="note">Note for the record</label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional for a booking. Required when declining, e.g. 'Refer to emergency'."
          />
          {error && (
            <div className="error" style={{ marginBottom: 14 }}>
              {error}
            </div>
          )}
          <div className="decide-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !slotId}
              onClick={() => run(() => api.approve(c.id, staff, slotId, note), "Booking approved. Patient notified on WhatsApp.")}
            >
              Approve booking
            </button>
            <button
              className="btn btn-danger"
              disabled={busy || note.trim().length < 2}
              title={note.trim().length < 2 ? "Add a note to decline" : undefined}
              onClick={() => run(() => api.reject(c.id, staff, note), "Declined. Patient told the clinic will follow up.")}
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <div className="panel glass decided">
          <span className={`tag ${c.status === "approved" ? "tag-routine" : "tag-urgent"}`}>
            {c.status === "approved" ? "Booked" : "Declined"}
          </span>
          <div>
            <p>
              {c.status === "approved" && c.proposed_slot
                ? `${slotTime(c.proposed_slot.starts_at)} with ${c.proposed_slot.doctor}`
                : c.review_note}
            </p>
            <p className="engine">
              By {c.reviewed_by}
              {c.reviewed_at ? `, ${ago(c.reviewed_at)}` : ""}
            </p>
          </div>
        </div>
      )}

      <div className="panel glass">
        <h3>Activity</h3>
        <ol className="timeline">
          {[...log].reverse().map((e) => (
            <li key={e.id}>
              <time dateTime={e.at}>
                {toDate(e.at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true })}
              </time>
              <span>
                <span className="actor">{e.actor === "ai" ? "Sehat Saathi" : e.actor === "system" ? "System" : e.actor}</span>{" "}
                {(ACTION_LABEL[e.action] ?? e.action).toLowerCase()}
                {e.detail ? `: ${e.detail}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
