"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "../lib/api";
import { cx, fmtTime, type ElderT } from "../lib/community";
import type { UiLang } from "../lib/patientText";
import { useSession } from "../lib/useSession";
import ElderSetup from "./ElderSetup";
import PatientFrame, { L } from "./PatientFrame";
import SosBanner from "./SosBanner";

export default function FamilyView() {
  return <PatientFrame>{(lang) => <Family lang={lang} />}</PatientFrame>;
}

const STATUS: Record<ElderT["status"], { icon: string; en: string; ur: string }> = {
  ok: { icon: "✅", en: "Okay today", ur: "آج ٹھیک ہیں" },
  help: { icon: "🆘", en: "Asked for help", ur: "مدد مانگی" },
  upcoming: { icon: "🕘", en: "Check-in later today", ur: "آج بعد میں" },
  waiting: { icon: "⏳", en: "Waiting for check-in", ur: "انتظار" },
  missed: { icon: "⚠️", en: "Hasn't checked in: please call", ur: "چیک اِن نہیں کیا: فون کریں" },
};

function Family({ lang }: { lang: UiLang }) {
  const router = useRouter();
  const { session, ready } = useSession();
  const [list, setList] = useState<ElderT[] | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", checkin_time: "09:00", grace_min: 120, lang: "ur" as "ur" | "en" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [setup, setSetup] = useState<number | null>(null);
  const alarm = !!list?.some((e) => e.sos && ["waiting", "no_response", "help"].includes(e.sos.status));

  const load = useCallback(() => cx.elders().then(setList).catch((e) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace("/login");
    else {
      load();
      const id = setInterval(load, alarm ? 4000 : 15000);
      return () => clearInterval(id);
    }
  }, [ready, session, router, load, alarm]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <>
      <section className="p-card">
        <h1>{L(lang, "Family & guardians", "گھر والے اور سرپرست")}</h1>
        <p className="p-muted">
          {L(lang, "For a parent or grandparent living alone. They get a big HELP button on their phone: if they press it and don't answer within 1 minute, every guardian is told to check on them. They also tap \"I'm okay\" once a day.",
            "اکیلے رہنے والے والدین یا بزرگوں کے لیے۔ ان کے فون پر مدد کا بڑا بٹن ہوگا: اگر دبانے کے بعد 1 منٹ تک جواب نہ دیں تو ہر سرپرست کو خیریت معلوم کرنے کا کہا جائے گا۔ وہ روز ایک بار \"میں ٹھیک ہوں\" بھی دبائیں گے۔")}
        </p>
        {error && <div className="error">{error}</div>}
        <ul className="elder-list">
          {list?.map((e) => (
            <li key={e.id} className={`elder ${e.status}`}>
              <div className="elder-top">
                <span className="elder-icon" aria-hidden>{STATUS[e.status].icon}</span>
                <span className="elder-who">
                  <b>{e.name}</b>
                  <small>
                    {L(lang, STATUS[e.status].en, STATUS[e.status].ur)}
                    {e.checked_at ? ` · ${new Date(e.checked_at).toLocaleTimeString(lang === "ur" ? "ur-PK" : "en-PK", { hour: "numeric", minute: "2-digit" })}` : ""}
                    {` · ${L(lang, "daily at", "روزانہ")} ${fmtTime(e.checkin_time, lang)}`}
                  </small>
                </span>
              </div>
              {e.sos && (
                <SosBanner name={e.name} phone={e.phone} sos={e.sos} lang={lang}
                           onHandled={async () => { await cx.familyHandled(e.id, e.sos!.id); await load(); }} />
              )}
              <div className="elder-week" aria-label={L(lang, "Last 7 days", "پچھلے 7 دن")}>
                {Array.from({ length: 7 }, (_, k) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (6 - k));
                  const key = d.toISOString().slice(0, 10);
                  const hit = e.week.find((w) => w.day === key);
                  return <span key={key} className={hit ? hit.status : "none"} title={key} />;
                })}
              </div>
              <div className="elder-acts">
                {e.phone && <a className="btn btn-quiet" href={`tel:${e.phone}`}>📞 {L(lang, "Call", "کال")}</a>}
                <a className="btn btn-quiet p-wa" target="_blank" rel="noreferrer"
                   href={`https://wa.me/?text=${encodeURIComponent(`${L(lang, "Your daily check-in button", "آپ کا روزانہ خیریت کا بٹن")}: ${origin}${e.link}`)}`}>
                  {L(lang, "Send their link", "ان کا لنک بھیجیں")}
                </a>
                <button type="button" className="btn btn-quiet" onClick={() => { navigator.clipboard?.writeText(origin + e.link); setCopied(e.id); setTimeout(() => setCopied(null), 2000); }}>
                  {copied === e.id ? "✓" : L(lang, "Copy link", "لنک کاپی")}
                </button>
                <button type="button" className="btn btn-quiet" aria-expanded={setup === e.id} onClick={() => setSetup(setup === e.id ? null : e.id)}>
                  🆘 {e.has_pin ? L(lang, "Emergency button", "ایمرجنسی بٹن") : L(lang, "Set up emergency button", "ایمرجنسی بٹن سیٹ کریں")}
                </button>
              </div>
              {setup === e.id && <ElderSetup elder={e} lang={lang} />}
            </li>
          ))}
        </ul>
        {list?.length === 0 && <p className="p-muted">{L(lang, "No one added yet.", "ابھی کوئی شامل نہیں۔")}</p>}
      </section>

      <form
        className="p-card"
        onSubmit={async (ev) => {
          ev.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await cx.addElder(form);
            setForm({ ...form, name: "", phone: "" });
            await load();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{L(lang, "Add someone", "کسی کو شامل کریں")}</h2>
        <label htmlFor="el-name">{L(lang, "Their name", "ان کا نام")}</label>
        <input id="el-name" dir="auto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={L(lang, "Ammi Jan", "امی جان")} />
        <label htmlFor="el-phone">{L(lang, "Their phone (for you to call)", "ان کا فون نمبر")}</label>
        <input id="el-phone" inputMode="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0300 1234567" />
        <label htmlFor="el-time">{L(lang, "Daily check-in time", "روزانہ خیریت کا وقت")}</label>
        <input id="el-time" type="time" value={form.checkin_time} onChange={(e) => setForm({ ...form, checkin_time: e.target.value })} />
        <label>{L(lang, "Tell me if no answer within", "اگر جواب نہ آئے تو بتائیں")}</label>
        <div className="chips">
          {[60, 120, 240].map((m) => (
            <button key={m} type="button" aria-pressed={form.grace_min === m} onClick={() => setForm({ ...form, grace_min: m })}>
              {L(lang, `${m / 60} hour${m > 60 ? "s" : ""}`, `${m / 60} گھنٹے`)}
            </button>
          ))}
        </div>
        <label>{L(lang, "Their language", "ان کی زبان")}</label>
        <div className="chips">
          <button type="button" aria-pressed={form.lang === "ur"} onClick={() => setForm({ ...form, lang: "ur" })}>اردو</button>
          <button type="button" aria-pressed={form.lang === "en"} onClick={() => setForm({ ...form, lang: "en" })}>English</button>
        </div>
        <button className="btn btn-primary p-submit" type="submit" disabled={busy || form.name.trim().length < 2}>
          {busy ? "…" : L(lang, "Add and get their link", "شامل کریں اور لنک لیں")}
        </button>
        <p className="p-muted small">
          {L(lang, "Open their link on their phone once and tap \"Turn on daily reminder\". Then they get a notification every day.",
            "ان کا لنک ایک بار ان کے فون پر کھولیں اور \"روزانہ یاد دہانی آن کریں\" دبائیں۔ پھر انہیں روز نوٹیفکیشن آئے گا۔")}
        </p>
      </form>
      <p className="p-foot">
        <Link href="/patient/home">← {L(lang, "My requests", "میری درخواستیں")}</Link>
      </p>
    </>
  );
}
