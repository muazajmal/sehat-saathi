"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  api,
  ApiError,
  IN_MULTAN,
  languageLabel,
  SAMPLE_LOCATION,
  scriptClass,
  slotTime,
  URGENCY_LABEL,
  type Case,
  type IntakeResult,
} from "../lib/api";

const SAMPLES: { label: string; text: string }[] = [
  { label: "Chest pain", text: "Mere abbu ko 20 minute se seene mein dard hai aur paseena aa raha hai" },
  { label: "Child fever", text: "میرے بچے کو کل رات سے تیز بخار ہے اور الٹی بھی ہو رہی ہے" },
  { label: "Skin rash", text: "Haath pe kharish aur rash hai 1 hafte se" },
  { label: "BP follow-up", text: "I need a routine follow-up for my blood pressure" },
  { label: "Saraiki", text: "میڈے ٻال کوں کل رات توں تیز بخار ہے تے الٹی وی تھیندی پئی ہے" },
  { label: "Pashto", text: "زما پلار ته د سینې درد دی او ساه نه شي اخیستلی" },
  { label: "Punjabi", text: "مینوں دو دن توں تاپ اے تے سر وچ پیڑ اے" },
  { label: "Sindhi", text: "منهنجي ٻار کي تيز بخار آهي" },
  { label: "Arabic", text: "أعاني من ألم في الصدر وضيق في التنفس" },
];

type Msg =
  | { kind: "patient"; text: string }
  | { kind: "bot"; text: string; language?: string }
  | { kind: "typing" }
  | { kind: "doctor"; c: Case }
  | { kind: "actions"; c: IntakeResult }
  | { kind: "note"; text: string };

export default function PhoneDemo() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { kind: "bot", text: "السلام علیکم! اپنی تکلیف لکھیں یا وائس نوٹ بھیجیں۔ ڈاکٹر ہر وقت کی تصدیق خود کرے گا۔" },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState<number | null>(null);
  const [shared, setShared] = useState<number[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  // A stable demo phone number per browser so repeat messages group under one patient.
  const phone = useRef("+92300" + Math.floor(1000000 + Math.random() * 8999999));

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    setError(null);
    setBusy(true);
    setMsgs((m) => [...m, { kind: "patient", text: t }, { kind: "typing" }]);
    try {
      const c = await api.intake(phone.current, "Demo patient", t);
      setMsgs((m) => [
        ...m.filter((x) => x.kind !== "typing"),
        { kind: "bot", text: c.reply_ur, language: c.language },
        ...(c.urgency !== "routine" ? [{ kind: "actions" as const, c }] : []),
        { kind: "doctor", c },
      ]);
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.kind !== "typing"));
      setError(e instanceof ApiError ? e.message : "Something went wrong sending that message.");
    } finally {
      setBusy(false);
    }
  }

  // Share the visitor's real location if they're in Multan; otherwise use a clearly-labelled sample.
  async function shareLocation(c: IntakeResult) {
    setLocating(c.id);
    const here = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 7000, maximumAge: 60000 },
      );
    });
    const real = here && IN_MULTAN(here.lat, here.lng);
    const loc = real
      ? { lat: here!.lat, lng: here!.lng, label: "Shared from this phone", source: "web" as const }
      : { ...SAMPLE_LOCATION, source: "sample" as const };
    try {
      await api.patientLocation(c.id, c.access_token, loc.lat, loc.lng, loc.label);
      setShared((s) => [...s, c.id]);
      setMsgs((m) => [
        ...m,
        {
          kind: "note",
          text: real
            ? "Location shared. The clinic can now send a Sehat Saathi responder to take you to hospital."
            : "Demo: your real location wasn't available or isn't in Multan, so a sample one was used (Gulgasht Colony). The clinic can now send a responder.",
        },
      ]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't share the location.");
    } finally {
      setLocating(null);
    }
  }

  return (
    <div className="phone" aria-label="Live demo: send a symptom message">
      <div className="phone-screen">
        <div className="phone-head">
          <div className="phone-avatar" aria-hidden>
            س
          </div>
          <div>
            <strong>Sehat Saathi</strong>
            <small>Shifa Family Clinic on WhatsApp</small>
          </div>
        </div>

        <div className="chat" ref={chatRef} aria-live="polite">
          {msgs.map((m, i) => {
            if (m.kind === "typing") return <div key={i} className="bubble in typing">Reading your message…</div>;
            if (m.kind === "doctor") return <DoctorCard key={i} c={m.c} />;
            if (m.kind === "note") return <p key={i} className="chat-note">{m.text}</p>;
            if (m.kind === "actions")
              return (
                <div key={i} className="chat-actions">
                  {m.c.urgency === "urgent" && (
                    <a className="sos" href="tel:1122">
                      Call 1122 now
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => shareLocation(m.c)}
                    disabled={locating === m.c.id || shared.includes(m.c.id)}
                  >
                    {shared.includes(m.c.id)
                      ? "Location shared"
                      : locating === m.c.id
                        ? "Getting location…"
                        : "Share my location"}
                  </button>
                </div>
              );
            const script = scriptClass(m.text, m.kind === "bot" ? m.language : undefined);
            return (
              <div
                key={i}
                className={`bubble ${m.kind === "patient" ? "out" : "in"}${script ? ` ${script}` : ""}`}
                dir={script ? "rtl" : "auto"}
              >
                {m.text}
              </div>
            );
          })}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="samples" role="group" aria-label="Try a sample message">
          {SAMPLES.map((s) => (
            <button key={s.label} type="button" onClick={() => send(s.text)} disabled={busy}>
              {s.label}
            </button>
          ))}
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type in any language: Urdu, Punjabi, Pashto, Sindhi…"
            aria-label="Message"
            dir="auto"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

function DoctorCard({ c }: { c: Case }) {
  return (
    <div className="doctor-view">
      <h3>What the doctor sees on the desk</h3>
      <span className={`tag tag-${c.urgency}`}>{URGENCY_LABEL[c.urgency]}</span>{" "}
      <span className="lang-chip">Wrote in {languageLabel(c.language)}</span>
      <p>{c.summary}</p>
      <p>
        {c.proposed_slot
          ? `Slot held: ${c.proposed_slot.doctor}, ${slotTime(c.proposed_slot.starts_at)}`
          : "No slot free in the window. The doctor will pick one."}
      </p>
      {c.needs_callback && <p className="callback-flag">Duty doctor alerted to call back</p>}
      {c.urgency !== "routine" && <p>If the patient shares a location, staff can send a Sehat Saathi responder.</p>}
      <p>
        Waiting for approval. <Link href={`/desk?case=${c.id}`}>Open on the desk</Link>
      </p>
    </div>
  );
}
