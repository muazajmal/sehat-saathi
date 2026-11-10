"use client";

import { useEffect, useState } from "react";
import type { SosT } from "../lib/community";

type Lang = "en" | "ur";
const T = (lang: Lang, en: string, ur: string) => (lang === "ur" ? ur : en);

function time(iso: string | null, lang: Lang) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(lang === "ur" ? "ur-PK" : "en-PK", { hour: "numeric", minute: "2-digit" });
}

/** What a guardian sees when the elder pressed the emergency button. Shared by the family page and
 * the guardian's private link. */
export default function SosBanner({ name, phone, sos, lang, onHandled }: {
  name: string;
  phone: string;
  sos: SosT;
  lang: Lang;
  onHandled?: () => Promise<void> | void;
}) {
  const [left, setLeft] = useState(sos.seconds_left);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setLeft(sos.seconds_left);
    if (sos.status !== "waiting") return;
    const end = Date.now() + sos.seconds_left * 1000;
    const id = setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [sos.seconds_left, sos.status, sos.id]);

  const head: Record<SosT["status"], [string, string]> = {
    waiting: [`🚨 ${name} pressed the EMERGENCY button`, `🚨 ${name} نے ایمرجنسی بٹن دبایا`],
    no_response: [`⚠️ ${name} did not respond after pressing EMERGENCY. Check on them now.`,
      `⚠️ ${name} نے ایمرجنسی بٹن دبانے کے بعد جواب نہیں دیا۔ ابھی خیریت معلوم کریں۔`],
    help: [`🚑 ${name} says they need an ambulance`, `🚑 ${name} کو ایمبولینس چاہیے`],
    okay: [`✅ ${name} answered: I'm okay`, `✅ ${name} نے بتایا: میں ٹھیک ہوں`],
    resolved: [`🤝 Handled by ${sos.resolved_by}`, `🤝 ${sos.resolved_by} نے سنبھال لیا`],
  };
  const bad = sos.status === "waiting" || sos.status === "no_response" || sos.status === "help";

  return (
    <div className={`sos-banner ${sos.status}`} role={bad ? "alert" : "status"}>
      <b>{T(lang, ...head[sos.status])}</b>
      <small>
        {T(lang, "Pressed at", "دبایا")} {time(sos.started_at, lang)}
        {sos.status === "waiting" && ` · ${T(lang, `waiting for their answer: ${left}s`, `ان کے جواب کا انتظار: ${left} سیکنڈ`)}`}
        {sos.responded_at && ` · ${T(lang, "answered", "جواب")} ${time(sos.responded_at, lang)}`}
        {sos.case_id ? ` · ${T(lang, "hospital alerted", "ہسپتال کو اطلاع")}` : ""}
      </small>
      {bad && (
        <div className="sos-banner-acts">
          {phone && <a className="btn btn-primary" href={`tel:${phone}`}>📞 {T(lang, `Call ${name}`, `${name} کو کال`)}</a>}
          <a className="btn sos-1122" href="tel:1122">🚑 1122</a>
          {sos.map && <a className="btn btn-quiet" href={sos.map} target="_blank" rel="noreferrer">📍 {T(lang, "Their location", "ان کا مقام")}</a>}
          {onHandled && (
            <button type="button" className="btn btn-quiet" disabled={busy}
                    onClick={async () => { setBusy(true); try { await onHandled(); } finally { setBusy(false); } }}>
              🤝 {T(lang, "I'm with them / handled", "میں ان کے پاس ہوں / سنبھال لیا")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
