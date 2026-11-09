"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../lib/api";
import { cx, type BloodAskT } from "../lib/community";
import type { UiLang } from "../lib/patientText";
import PatientFrame, { L } from "./PatientFrame";

export default function DonorAnswerView() {
  return <PatientFrame>{(lang) => <Answer lang={lang} />}</PatientFrame>;
}

function Answer({ lang }: { lang: UiLang }) {
  const p = useSearchParams();
  const a = Number(p.get("a"));
  const t = p.get("t") ?? "";
  const [ask, setAsk] = useState<BloodAskT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cx.bloodAsk(a, t).then(setAsk).catch((x) => setError(x instanceof ApiError ? x.message : String(x)));
  }, [a, t]);

  async function answer(v: "yes" | "no") {
    setBusy(true);
    try {
      setAsk(await cx.bloodAnswer(a, t, v));
    } catch (x) {
      setError(x instanceof ApiError ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <section className="p-card"><div className="error">{error}</div></section>;
  if (!ask) return <section className="p-card"><p className="p-muted">…</p></section>;
  return (
    <section className="p-card">
      <p className="donor-badge">{ask.blood_group}</p>
      <h1>{L(lang, `Blood needed at ${ask.hospital}`, `${ask.hospital} میں خون کی ضرورت ہے`)}</h1>
      <p className="p-muted">
        {L(lang, `${ask.units} unit(s) of ${ask.blood_group} or a compatible group.`, `${ask.blood_group} یا ملتے گروپ کی ${ask.units} بوتل۔`)}
        {ask.km != null ? ` ${L(lang, `About ${ask.km} km from you.`, `آپ سے تقریباً ${ask.km} کلومیٹر۔`)}` : ""}
      </p>
      {ask.answer === "waiting" && ask.request_status === "open" && (
        <>
          <button type="button" className="btn btn-primary p-submit" disabled={busy} onClick={() => answer("yes")}>
            🩸 {L(lang, "Yes, I can donate", "جی، میں دے سکتا/سکتی ہوں")}
          </button>
          <button type="button" className="btn btn-quiet p-submit" disabled={busy} onClick={() => answer("no")}>
            {L(lang, "Not this time", "اس بار نہیں")}
          </button>
          <p className="p-muted small">{L(lang, "Your number goes to the hospital only if you say yes.", "آپ کا نمبر صرف ہاں کہنے پر ہسپتال کو جائے گا۔")}</p>
        </>
      )}
      {ask.answer === "yes" && (
        <>
          <p className="p-ok">✓ {L(lang, "Thank you! The hospital will call you. Please go to the blood bank.", "شکریہ! ہسپتال آپ کو فون کرے گا۔ براہ کرم بلڈ بینک جائیں۔")}</p>
          {ask.hospital_position && (
            <a className="btn btn-primary p-submit" target="_blank" rel="noreferrer"
               href={`https://www.google.com/maps/dir/?api=1&destination=${ask.hospital_position.lat},${ask.hospital_position.lng}`}>
              🧭 {L(lang, "Directions", "راستہ")}
            </a>
          )}
          {ask.hospital_phone && <a className="btn btn-quiet p-submit" href={`tel:${ask.hospital_phone}`}>📞 {L(lang, "Call the hospital", "ہسپتال کو کال کریں")}</a>}
        </>
      )}
      {ask.answer === "no" && <p className="p-muted">{L(lang, "No problem. Thank you for being on the list.", "کوئی بات نہیں۔ لسٹ میں رہنے کا شکریہ۔")}</p>}
      {ask.answer === "waiting" && ask.request_status !== "open" && (
        <p className="p-muted">{L(lang, "Thank you! Enough donors have already said yes.", "شکریہ! کافی ڈونرز ہاں کہہ چکے ہیں۔")}</p>
      )}
    </section>
  );
}
