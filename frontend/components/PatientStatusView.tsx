"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  api,
  ApiError,
  PAY_METHOD_LABEL,
  rupees,
  SAMPLE_LOCATION,
  scriptClass,
  slotTime,
  type PatientStatus,
  type PayMethod,
  apiCall,
} from "../lib/api";
import { T } from "../lib/patientText";
import { EmergencyBar, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";
import InstallApp from "./InstallApp";
import ReadAloud from "./ReadAloud";
import FirstAidSheet from "./FirstAidSheet";
import TripMap from "./TripMap";

export default function PatientStatusView() {
  const params = useSearchParams();
  const c = Number(params.get("c"));
  const token = params.get("t") ?? "";
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const t = T[lang];
  const [st, setSt] = useState<PatientStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!c || !token) return setError("This link is incomplete.");
    try {
      setSt(await api.patientStatus(c, token));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load your request. Check your internet.");
    }
  }, [c, token]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function share(sample = false) {
    setLocError(null);
    setLocating(true);
    try {
      let pos: { lat: number; lng: number; label: string };
      if (sample) {
        pos = { lat: SAMPLE_LOCATION.lat, lng: SAMPLE_LOCATION.lng, label: SAMPLE_LOCATION.label };
      } else {
        pos = await new Promise((resolve, reject) => {
          if (!("geolocation" in navigator)) return reject(new Error("no-geo"));
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Shared by the patient" }),
            reject,
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
          );
        });
      }
      setSt(await api.patientLocation(c, token, pos.lat, pos.lng, pos.label));
    } catch {
      setLocError(t.locationBlocked);
    } finally {
      setLocating(false);
    }
  }

  const replyScript = st ? scriptClass(st.reply, st.language) : "";
  const trip = st?.trip;

  return (
    <main className="patient" dir={t.dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={st?.clinic || clinic} />
      {(!st || st.call_1122) && <EmergencyBar lang={lang} />}
      {error && <div className="error">{error}</div>}

      {st && (
        <>
          {st.call_1122 && !trip && (
            <section className="p-card p-urgent">
              <h2>{t.serious}</h2>
              <a className="p-sos-btn big" href="tel:1122">
                {t.call1122}
              </a>
              {!st.location_shared ? (
                <>
                  <p className="p-muted">{t.shareWhy}</p>
                  <button className="btn btn-primary" type="button" disabled={locating} onClick={() => share()}>
                    {locating ? t.locating : t.shareLocation}
                  </button>
                  <button className="p-link" type="button" disabled={locating} onClick={() => share(true)}>
                    {t.sampleLocation}
                  </button>
                </>
              ) : st.out_of_area ? (
                <div className="p-away">
                  <b>{t.outOfAreaTitle}</b>
                  <p>{t.outOfArea(Math.round(st.nearest_hospital_km ?? 0))}</p>
                </div>
              ) : (
                <p className="p-ok">{t.locationShared}</p>
              )}
              {locError && <div className="error">{locError}</div>}
            </section>
          )}

          {st.email_to && st.status !== "rejected" && (
            <p className="p-muted small p-email-note">
              ✉️{" "}
              {st.status === "approved"
                ? lang === "ur" ? `تصدیقی ای میل ${st.email_to} پر بھیج دی گئی ہے۔` : `Confirmation emailed to ${st.email_to}.`
                : lang === "ur" ? `وقت کنفرم ہونے پر ${st.email_to} پر ای میل آئے گی۔` : `We'll email ${st.email_to} when your time is confirmed.`}
            </p>
          )}

          {trip && trip.status !== "cancelled" && (
            <section className={`p-card p-trip phase-${trip.phase}`}>
              <h2>
                {trip.phase === "to_patient"
                  ? t.onTheWay(trip.responder)
                  : trip.phase === "waiting_at_patient"
                    ? t.reached(trip.responder)
                    : trip.phase === "to_hospital"
                      ? t.toHospital(trip.hospital)
                      : t.arrived(trip.hospital)}
              </h2>
              {(trip.phase === "to_patient" || trip.phase === "to_hospital") && (
                <p className="p-big">{t.away(trip.km_away.toFixed(1), Math.max(1, trip.eta_min))}</p>
              )}
              {trip.position && trip.start && trip.patient && trip.hospital_position && (
                <TripMap
                  start={trip.start}
                  patient={trip.patient}
                  hospital={trip.hospital_position}
                  position={trip.position}
                  phase={trip.phase}
                  hospitalName={trip.hospital}
                  youLabel={lang === "ur" ? "آپ" : "You"}
                />
              )}
              <p className="p-muted">
                {trip.vehicle}
                {trip.mode === "simulated" ? ` · ${t.demo}` : ""}
              </p>
            </section>
          )}

          <section className="p-card">
            <h2>{t.yourRequest}</h2>
            <p className={`p-reply ${replyScript}`} dir={replyScript ? "rtl" : "auto"}>
              {st.reply}
            </p>
            <ReadAloud text={st.reply} language={st.language} label={t.listen} stopLabel={t.stopListening} />
            <ol className="p-steps">
              <li className="done">{t.received}</li>
              {st.status === "pending_review" && <li className="now">{t.reviewing}</li>}
              {st.status === "approved" && <li className="done">{t.confirmed}</li>}
              {st.status === "rejected" && <li className="done">{t.clinicWillContact}</li>}
            </ol>
            {st.booked_slot && (
              <p className="p-slot ok" dir="ltr">
                {slotTime(st.booked_slot.starts_at)} · {st.booked_slot.doctor}
              </p>
            )}
            {st.booked_slot && !st.attendance && new Date(st.booked_slot.starts_at + (st.booked_slot.starts_at.endsWith("Z") ? "" : "+05:00")) > new Date() && (
              <div className="p-reply-row">
                {st.patient_reply === "cancelled" ? (
                  <p className="p-muted">{lang === "ur" ? "آپ نے یہ وقت منسوخ کر دیا ہے۔" : "You cancelled this visit. The time is free for someone else."}</p>
                ) : st.patient_reply === "coming" ? (
                  <p className="p-ok">✓ {lang === "ur" ? "شکریہ! ہم آپ کا انتظار کریں گے۔" : "Thank you! We'll expect you."}</p>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary" onClick={async () => {
                      await apiCall(`/api/patient/reply?c=${c}&t=${encodeURIComponent(token)}&reply=coming`, { method: "POST" });
                      load();
                    }}>
                      ✓ {lang === "ur" ? "میں آؤں گا/گی" : "I'll come"}
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={async () => {
                      if (!window.confirm(lang === "ur" ? "کیا آپ یہ وقت منسوخ کرنا چاہتے ہیں؟" : "Cancel this visit? The time will be given to someone else.")) return;
                      await apiCall(`/api/patient/reply?c=${c}&t=${encodeURIComponent(token)}&reply=cancelled`, { method: "POST" });
                      load();
                    }}>
                      {lang === "ur" ? "منسوخ کریں" : "Cancel"}
                    </button>
                  </>
                )}
              </div>
            )}
            {st.held_slot && (
              <>
                <p className="p-muted small">{t.suggested}</p>
                <p className="p-slot" dir="ltr">
                  {slotTime(st.held_slot.starts_at)} · {st.held_slot.doctor}
                </p>
              </>
            )}
            {st.called_back && <p className="p-ok">{t.calledBack}</p>}
          </section>

          {st.charges.length > 0 && (
            <section className="p-card p-pay">
              <h2>{t.payTitle}</h2>
              <ul>
                {st.charges.map((f) => (
                  <li key={f.id} className={`p-fee ${f.status}`}>
                    <b dir="ltr">
                      {f.status === "due"
                        ? t.amountDue(rupees(f.amount_pkr))
                        : f.status === "paid"
                          ? t.paid(rupees(f.amount_pkr), PAY_METHOD_LABEL[f.method as PayMethod] ?? "")
                          : t.waived(rupees(f.amount_pkr))}
                    </b>
                    <span dir="ltr">{f.description}</span>
                  </li>
                ))}
              </ul>
              {st.charges.some((f) => f.status === "due") && <p className="p-muted small">{t.payHow}</p>}
            </section>
          )}

          <section className="p-card p-save">
            <p>{t.save}</p>
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(window.location.href)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => {})
              }
            >
              {copied ? t.copied : t.copy}
            </button>
            <a
              className="btn btn-quiet p-wa"
              href={typeof window === "undefined" ? "#" : `https://wa.me/?text=${encodeURIComponent(`${t.waText} ${window.location.href}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t.whatsapp}
            </a>
            <Link className="btn btn-quiet" href="/patient">
              {t.another}
            </Link>
          </section>
        </>
      )}
      <InstallApp lang={lang} />
      <p className="p-foot">{t.notDiagnosis}</p>
      {st && st.first_aid.length > 0 && st.status !== "rejected" && (
        <FirstAidSheet
          keys={st.first_aid}
          lang={lang}
          etaMin={trip && trip.phase === "to_patient" ? trip.eta_min : null}
        />
      )}
    </main>
  );
}
