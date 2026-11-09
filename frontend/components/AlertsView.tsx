"use client";

import { useEffect, useState } from "react";
import { cx, type AreaAlertT } from "../lib/community";
import type { UiLang } from "../lib/patientText";
import PatientFrame, { L } from "./PatientFrame";

export default function AlertsView() {
  return <PatientFrame>{(lang) => <Alerts lang={lang} />}</PatientFrame>;
}

function Alerts({ lang }: { lang: UiLang }) {
  const [list, setList] = useState<AreaAlertT[] | null>(null);
  useEffect(() => {
    cx.publicAlerts().then(setList).catch(() => setList([]));
  }, []);
  return (
    <>
      <section className="p-card">
        <h1>📢 {L(lang, "Health alerts for your area", "آپ کے علاقے کے لیے صحت الرٹس")}</h1>
        <p className="p-muted">{L(lang, "Notices from the hospital when an illness is rising in a neighbourhood. Checked by a doctor before they're sent.",
          "جب کسی علاقے میں کوئی بیماری بڑھے تو ہسپتال کی طرف سے اطلاع۔ بھیجنے سے پہلے ڈاکٹر چیک کرتا ہے۔")}</p>
        {list?.length === 0 && <p className="p-ok">✓ {L(lang, "No alerts right now.", "اس وقت کوئی الرٹ نہیں۔")}</p>}
      </section>
      {list?.map((a) => (
        <section key={a.id} id={`a${a.id}`} className={`p-card area-alert ${a.level}`}>
          <p className="area-tag">📍 {a.area}</p>
          <h2 className={lang === "ur" ? "urdu" : ""}>{lang === "ur" ? a.title_ur : a.title_en}</h2>
          <p className={lang === "ur" ? "urdu" : ""}>{lang === "ur" ? a.body_ur : a.body_en}</p>
          <p className="p-muted small">
            {L(lang, "Approved by", "منظوری")} {a.approved_by} ·{" "}
            {a.published_at && new Date(a.published_at).toLocaleDateString(lang === "ur" ? "ur-PK" : "en-PK", { day: "numeric", month: "short" })}
          </p>
        </section>
      ))}
    </>
  );
}
