"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError, IN_MULTAN, SAMPLE_LOCATION, scriptClass, slotTime, type PatientStatus } from "../lib/api";
import { T } from "../lib/patientText";
import { EmergencyBar, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

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
      if (!sample && !IN_MULTAN(pos.lat, pos.lng)) setLocError("Note: this location is outside Multan.");
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
              ) : (
                <p className="p-ok">{t.locationShared}</p>
              )}
              {locError && <div className="error">{locError}</div>}
            </section>
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
            <Link className="btn btn-quiet" href="/patient">
              {t.another}
            </Link>
          </section>
        </>
      )}
      <p className="p-foot">{t.notDiagnosis}</p>
    </main>
  );
}
