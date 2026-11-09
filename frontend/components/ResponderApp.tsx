"use client";

import TripMap from "./TripMap";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError, directionsLink, type ResponderTrip, type Track } from "../lib/api";

const SEND_EVERY_MS = 5000;

export default function ResponderApp() {
  const params = useSearchParams();
  const d = Number(params.get("d"));
  const token = params.get("t") ?? "";
  const [trip, setTrip] = useState<ResponderTrip | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    if (!d || !token) {
      setError("This link is incomplete. Ask the clinic to send it again.");
      return;
    }
    try {
      setTrip(await api.responderTrip(d, token));
      setTrack(await api.responderTrack(d, token));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load this trip.");
    }
  }, [d, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the map and distances fresh while the trip is on.
  useEffect(() => {
    if (!d || !token) return;
    const id = setInterval(() => {
      api.responderTrack(d, token).then(setTrack).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [d, token]);

  const stop = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    setSharing(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    if (!("geolocation" in navigator)) {
      setGpsError("This phone can't share its location from the browser.");
      return;
    }
    setGpsError(null);
    setSharing(true);
    try {
      // Keep the screen on while driving, where the browser allows it.
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      /* not supported: fine */
    }
    watchId.current = navigator.geolocation.watchPosition(
      async (p) => {
        const nowMs = Date.now();
        if (nowMs - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = nowMs;
        try {
          setTrack(await api.postPosition(d, token, p.coords.latitude, p.coords.longitude, p.coords.accuracy));
        } catch (e) {
          setGpsError(e instanceof ApiError ? e.message : "Couldn't send the location. Still trying.");
          if (e instanceof ApiError && /ended|not valid/.test(e.message)) stop();
        }
      },
      (err) =>
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow location for this site in the browser settings, then try again."
            : "Can't get a GPS fix right now. Move to an open area.",
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }

  async function setStatus(status: "reached_patient" | "at_hospital") {
    if (!trip) return;
    setBusy(true);
    try {
      await api.responderStatus(d, token, status);
      await load();
      if (status === "at_hospital") stop();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="responder"><div className="error">{error}</div></main>;
  if (!trip) return <main className="responder"><p className="muted">Loading the trip…</p></main>;

  const ended = trip.status === "at_hospital" || trip.status === "cancelled";
  const toPatient = trip.status === "dispatched";

  return (
    <main className="responder">
      <header>
        <span className="brand">Sehat Saathi · Responder</span>
        <h1>{toPatient ? "Pick up the patient" : ended ? "Trip finished" : "Take the patient to hospital"}</h1>
      </header>

      {trip.tier === "emergency" && !ended && (
        <div className="rescue-banner">
          <b>Emergency.</b> The family has been told to call 1122. If 1122 is already there, follow their crew.
          <a className="btn btn-danger" href="tel:1122">Call 1122</a>
        </div>
      )}

      {track && !ended && (
        <TripMap
          start={track.start}
          patient={track.patient}
          hospital={track.hospital_position}
          position={track.position}
          phase={track.phase}
          hospitalName={track.hospital}
          youLabel="Patient"
        />
      )}

      <section className="r-card">
        <h2>Patient</h2>
        <p className="big">{trip.patient}</p>
        <p className="muted">{trip.summary}</p>
        <a className="btn btn-quiet" href={`tel:${trip.patient_phone}`}>Call {trip.patient_phone}</a>
      </section>

      <section className="r-card">
        <h2>Pickup</h2>
        <p>{trip.pickup_label || "Shared location"}</p>
        <a className="btn btn-quiet" href={`https://www.google.com/maps/dir/?api=1&destination=${trip.pickup.lat},${trip.pickup.lng}`} target="_blank" rel="noreferrer">
          Navigate to patient
        </a>
      </section>

      {!ended && (
        <div className="r-actions">
          {toPatient ? (
            <button className="btn btn-primary big-btn" disabled={busy} onClick={() => setStatus("reached_patient")}>
              I&apos;ve reached the patient
            </button>
          ) : (
            <button className="btn btn-primary big-btn" disabled={busy} onClick={() => setStatus("at_hospital")}>
              We&apos;ve arrived at the hospital
            </button>
          )}
        </div>
      )}
      <section className="r-card">
        <h2>Hospital</h2>
        <p>{trip.hospital}</p>
        <div className="row">
          <a className="btn btn-quiet" href={directionsLink(trip.pickup, trip.hospital_position)} target="_blank" rel="noreferrer">
            Navigate to hospital
          </a>
          {trip.hospital_phone && <a className="btn btn-quiet" href={`tel:${trip.hospital_phone}`}>Call hospital</a>}
        </div>
      </section>

      {!ended && (
        <section className="r-card share">
          <h2>Live location</h2>
          <p className="muted">
            The clinic desk sees how far you are from the patient and the hospital. Keep this page open while driving.
          </p>
          {sharing ? (
            <>
              <p className="sharing">
                <span className="dot" /> Sharing
                {track?.mode === "live" && track.last_fix_seconds != null ? `, sent ${track.last_fix_seconds}s ago` : "…"}
              </p>
              {track && (
                <p>
                  {track.phase === "to_hospital"
                    ? `${track.km_to_hospital.toFixed(1)} km to the hospital`
                    : `${track.km_to_patient.toFixed(1)} km to the patient`}
                </p>
              )}
              <button className="btn btn-quiet" onClick={stop}>Stop sharing</button>
            </>
          ) : (
            <button className="btn btn-primary big-btn" onClick={start}>Start sharing my location</button>
          )}
          {gpsError && <div className="error">{gpsError}</div>}
        </section>
      )}

      {ended && <p className="muted">Thank you. This trip is closed and location sharing has stopped.</p>}
    </main>
  );
}
