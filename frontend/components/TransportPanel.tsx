"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  ApiError,
  ago,
  directionsLink,
  mapLink,
  SAMPLE_LOCATION,
  type DispatchStatus,
  type Transport,
} from "../lib/api";

const STEPS: { id: DispatchStatus; label: string }[] = [
  { id: "dispatched", label: "On the way" },
  { id: "reached_patient", label: "With patient" },
  { id: "at_hospital", label: "At hospital" },
];

function osmEmbed(points: { lat: number; lng: number }[], marker: { lat: number; lng: number }) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const pad = 0.006;
  const bbox = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad]
    .map((n) => n.toFixed(5))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker.lat},${marker.lng}`;
}

export default function TransportPanel({
  caseId,
  staff,
  onChanged,
}: {
  caseId: number;
  staff: string;
  onChanged: (msg: string) => void;
}) {
  const [t, setT] = useState<Transport | null>(null);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [responderId, setResponderId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.transport(caseId);
      setT(next);
      // Pre-select the AI's suggestion; staff can change it.
      setHospitalId((h) => (h && next.hospitals.some((x) => x.id === h) ? h : next.hospitals[0]?.id ?? null));
      setResponderId((r) => (r && next.responders.some((x) => x.id === r) ? r : next.responders[0]?.id ?? null));
    } catch {
      /* the desk shows connection problems already */
    }
  }, [caseId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 6000); // pick up a location the patient shares while staff are looking
    return () => clearInterval(timer);
  }, [load]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    if (!staff.trim()) {
      setError("Add your name in the top bar first, so the log shows who sent the responder.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged(msg);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!t) return null;
  const emergency = t.tier === "emergency";
  const d = t.dispatch;
  const active = d && (d.status === "dispatched" || d.status === "reached_patient");
  const hospital = t.hospitals.find((h) => h.id === hospitalId);
  const responder = t.responders.find((r) => r.id === responderId);
  const loc = t.location;

  return (
    <div className={`panel glass transport${emergency ? " emergency" : ""}`}>
      <h3>Getting to hospital</h3>

      {emergency && (
        <div className="rescue">
          <div>
            <strong>1122 first.</strong> Tell the family to call Rescue 1122 now. A Sehat Saathi responder can also
            go to help and meet them at hospital.
          </div>
          <a className="btn btn-danger" href="tel:1122">
            Call 1122
          </a>
        </div>
      )}

      {!loc ? (
        <div className="no-location">
          <p>
            The patient hasn&apos;t shared a location yet. On WhatsApp they tap <b>Share location</b>; on the website
            demo they tap <b>Share my location</b>.
          </p>
          <button
            className="btn btn-quiet"
            disabled={busy}
            onClick={() =>
              act(() => api.shareLocation(caseId, { ...SAMPLE_LOCATION, source: "sample" }), "Sample location set")
            }
          >
            Use a sample Multan location (demo)
          </button>
        </div>
      ) : (
        <>
          <p className="loc-line">
            Patient at <b>{loc.label || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}</b>
            <span className="muted">
              {" "}
              · shared {loc.source === "sample" ? "as a demo sample" : `via ${loc.source}`}, {ago(loc.at)} ·{" "}
              <a href={mapLink(loc.lat, loc.lng)} target="_blank" rel="noreferrer">
                Open map
              </a>
            </span>
          </p>

          <iframe
            className="mini-map"
            title="Patient location"
            loading="lazy"
            src={osmEmbed(
              [loc, ...(hospital ? [hospital] : []), ...(d ? [d.responder] : responder ? [responder] : [])],
              loc,
            )}
          />

          {d && (
            <div className={`trip trip-${d.status}`}>
              <ol className="steps" aria-label="Trip progress">
                {STEPS.map((s, i) => {
                  const at = STEPS.findIndex((x) => x.id === d.status);
                  const state = d.status === "cancelled" ? "off" : i < at ? "done" : i === at ? "now" : "next";
                  return (
                    <li key={s.id} className={state}>
                      {s.label}
                    </li>
                  );
                })}
              </ol>
              <p>
                <b>{d.responder.name}</b> ({d.responder.vehicle}) →{" "}
                <b>{d.hospital_name}</b>
                {d.status === "cancelled"
                  ? " · cancelled"
                  : d.status === "dispatched"
                    ? ` · about ${d.eta_minutes} min to the patient`
                    : ""}
              </p>
              <p className="muted">
                Sent by {d.approved_by}, {ago(d.created_at)}
                {d.responder.is_demo ? " · demo responder" : ""}
              </p>
              {active && (
                <div className="decide-actions">
                  {d.status === "dispatched" ? (
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() =>
                        act(() => api.dispatchStatus(d.id, staff, "reached_patient"), "Responder is with the patient")
                      }
                    >
                      Reached patient
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() =>
                        act(() => api.dispatchStatus(d.id, staff, "at_hospital"), "Patient arrived at hospital")
                      }
                    >
                      Arrived at hospital
                    </button>
                  )}
                  <a
                    className="btn btn-quiet"
                    href={directionsLink(loc, t.hospitals.find((h) => h.id === d.hospital_id) ?? loc)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Route to hospital
                  </a>
                  <button
                    className="btn btn-quiet"
                    disabled={busy}
                    onClick={() => act(() => api.dispatchStatus(d.id, staff, "cancelled"), "Dispatch cancelled")}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {!active && d?.status !== "at_hospital" && (
            <>
              <p className="reason">{t.reason}</p>
              <fieldset className="choice">
                <legend>Government hospital</legend>
                {t.hospitals.map((h) => (
                  <label key={h.id} className={h.id === hospitalId ? "on" : ""}>
                    <input
                      type="radio"
                      name={`hospital-${caseId}`}
                      checked={h.id === hospitalId}
                      onChange={() => setHospitalId(h.id)}
                    />
                    <span>
                      <b>{h.short}</b>
                      {h.match && <span className="lang-chip">Best match</span>}
                      <small>
                        {h.distance_km} km, about {h.eta_minutes} min · {h.area}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="choice">
                <legend>Nearest free responder</legend>
                {t.responders.length === 0 && <p className="muted">All responders are out. Call 1122.</p>}
                {t.responders.slice(0, 3).map((r) => (
                  <label key={r.id} className={r.id === responderId ? "on" : ""}>
                    <input
                      type="radio"
                      name={`responder-${caseId}`}
                      checked={r.id === responderId}
                      onChange={() => setResponderId(r.id)}
                    />
                    <span>
                      <b>{r.name}</b>
                      <small>
                        {r.vehicle} · {r.area} · about {r.eta_minutes} min away
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>

              {error && <div className="error">{error}</div>}
              <button
                className={`btn ${emergency ? "btn-danger" : "btn-primary"}`}
                disabled={busy || !hospitalId || !responderId}
                onClick={() =>
                  act(
                    () => api.dispatch(caseId, staff, responderId!, hospitalId!, ""),
                    `${responder?.name ?? "Responder"} sent. Patient told on WhatsApp.`,
                  )
                }
              >
                {emergency ? "Send responder (1122 first)" : "Send responder"}
              </button>
              <p className="muted fine">
                The AI suggests the hospital and the nearest free responder. You decide. The patient gets a message in
                their language with the responder&apos;s name and arrival time.
              </p>
            </>
          )}
          {error && active && <div className="error">{error}</div>}
        </>
      )}
    </div>
  );
}
