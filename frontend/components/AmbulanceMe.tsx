"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, ApiError, type AmbulanceMember } from "../lib/api";
import { AT, rememberMember } from "../lib/ambulanceText";
import { PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

const SEND_EVERY_MS = 30000; // while waiting for trips, every 30s is plenty

export default function AmbulanceMe() {
  const params = useSearchParams();
  const m = Number(params.get("m"));
  const token = params.get("t") ?? "";
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const t = AT[lang];
  const [me, setMe] = useState<AmbulanceMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const seenTrip = useRef("");

  const load = useCallback(async () => {
    if (!m || !token) return setError("This link is incomplete.");
    try {
      const r = await api.ambulanceMe(m, token);
      setMe(r);
      setError(null);
      if (r.trip_link && r.trip_link !== seenTrip.current) {
        seenTrip.current = r.trip_link;
        try {
          navigator.vibrate?.([300, 150, 300, 150, 600]);
        } catch {}
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load your page. Check your internet.");
    }
  }, [m, token]);

  useEffect(() => {
    if (m && token) rememberMember(m, token);
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, m, token]);

  const stopGps = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  // Send where the ambulance is while online and waiting for a trip.
  useEffect(() => {
    const waiting = me?.online && !me.busy;
    if (!waiting) return stopGps();
    if (watchId.current != null || !("geolocation" in navigator)) return;
    watchId.current = navigator.geolocation.watchPosition(
      async (p) => {
        setGpsError(false);
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        try {
          setMe(await api.ambulanceOnline(m, token, true, p.coords.latitude, p.coords.longitude));
          setSentAt(Date.now());
        } catch {}
      },
      () => setGpsError(true),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );
  }, [me?.online, me?.busy, m, token, stopGps]);

  useEffect(() => stopGps, [stopGps]);

  async function toggle(online: boolean) {
    setBusy(true);
    try {
      lastSent.current = 0;
      setMe(await api.ambulanceOnline(m, token, online));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="patient" dir={t.dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      {error && <div className="error">{error}</div>}

      {me && (
        <>
          <section className="p-card a-me">
            <p className="p-muted small" dir="auto">
              {me.driver_name}
              {me.organisation ? ` · ${me.organisation}` : ""}
            </p>
            <p dir="ltr" className="a-reg">
              {me.vehicle_reg} · {t.vehicles[me.vehicle_type]}
            </p>
            {me.status !== "approved" && (
              <>
                <h1>{me.status === "pending" ? t.pending : me.status === "rejected" ? t.rejected : t.suspended}</h1>
                <p className="p-muted">{me.status === "pending" ? t.pendingBody : t.contactClinic}</p>
                {me.review_note && me.status !== "pending" && <p dir="auto">{me.review_note}</p>}
              </>
            )}
          </section>

          {me.status === "approved" && me.trip_link && (
            <section className="p-card a-trip" role="alert">
              <h2>{me.busy ? t.onTrip : t.newTrip}</h2>
              {me.trip_tier === "emergency" && <p>{t.emergencyTrip}</p>}
              <Link className="btn btn-primary p-submit" href={me.trip_link}>
                {t.openTrip}
              </Link>
            </section>
          )}

          {me.status === "approved" && !me.busy && (
            <section className={`p-card a-online${me.online ? " on" : ""}`}>
              <h2>
                <span className="a-dot" aria-hidden /> {me.online ? t.online : t.offline}
              </h2>
              <p className="p-muted">{me.online ? t.onlineBody : t.offlineBody}</p>
              <button
                className={`btn p-submit ${me.online ? "btn-quiet" : "btn-primary"}`}
                type="button"
                disabled={busy}
                onClick={() => toggle(!me.online)}
              >
                {me.online ? t.goOffline : t.goOnline}
              </button>
              {me.online && sentAt && !gpsError && (
                <p className="p-muted small">{t.lastSent(new Date(sentAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }))}</p>
              )}
              {me.online && gpsError && <div className="error">{t.gpsOff}</div>}
              {me.online && !me.in_area && <p className="p-away small">{t.outside}</p>}
            </section>
          )}
        </>
      )}
      {!me && !error && <p className="p-muted">…</p>}
    </main>
  );
}
