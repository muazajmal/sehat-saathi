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
  type Track,
  type Transport,
} from "../lib/api";

const firstName = (name: string) => name.match(/\(([^)]+)\)$/)?.[1] ?? name;

const STEPS: { id: DispatchStatus; label: string }[] = [
  { id: "dispatched", label: "On the way" },
  { id: "reached_patient", label: "With patient" },
  { id: "at_hospital", label: "At hospital" },
];

type Pt = { lat: number; lng: number };

// A self-drawn map: no outside map service needed, so it always works in a demo.
function MiniMap({
  patient,
  hospitals,
  hospitalId,
  responders,
  responderId,
  track,
}: {
  patient: Pt;
  hospitals: (Pt & { id: string; short: string })[];
  hospitalId: string | null;
  responders: (Pt & { id: number; name: string })[];
  responderId: number | null;
  track?: Track | null;
}) {
  const W = 560;
  const H = 220;
  const pad = 34;
  const all = [patient, ...hospitals, ...responders, ...(track ? [track.start, track.position, ...track.trail] : [])];
  const minLat = Math.min(...all.map((p) => p.lat));
  const maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng));
  const maxLng = Math.max(...all.map((p) => p.lng));
  // Keep north up and roughly true proportions (1 degree of longitude is shorter here than 1 of latitude).
  const kx = Math.cos((patient.lat * Math.PI) / 180);
  const spanX = Math.max((maxLng - minLng) * kx, 0.005);
  const spanY = Math.max(maxLat - minLat, 0.005);
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const xy = (p: Pt) => ({ x: ox + (p.lng - minLng) * kx * scale, y: H - (oy + (p.lat - minLat) * scale) });
  const P = xy(patient);
  const hosp = hospitals.find((h) => h.id === hospitalId);
  const resp = responders.find((r) => r.id === responderId);
  const H1 = hosp ? xy(hosp) : null;
  const R1 = resp ? xy(resp) : null;
  const label = (t: string) => (t.length > 22 ? t.slice(0, 21) + "…" : t);

  return (
    <svg className="mini-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the patient, responders and hospitals">
      <defs>
        <pattern id="mm-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeOpacity="0.07" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#mm-grid)" />
      {track ? (
        <>
          {track.trail.length > 1 && (
            <polyline
              className="mm-trail"
              points={track.trail.map((p) => { const q = xy(p); return `${q.x},${q.y}`; }).join(" ")}
            />
          )}
          {(track.phase === "to_patient") && (() => { const C = xy(track.position); return (
            <line x1={C.x} y1={C.y} x2={P.x} y2={P.y} className="mm-route" />); })()}
          {H1 && track.phase !== "at_hospital" && track.phase !== "cancelled" && (() => {
            const from = track.phase === "to_hospital" ? xy(track.position) : P;
            return <line x1={from.x} y1={from.y} x2={H1.x} y2={H1.y} className="mm-route to-hospital" />;
          })()}
        </>
      ) : (
        <>
          {R1 && <line x1={R1.x} y1={R1.y} x2={P.x} y2={P.y} className="mm-route" />}
          {H1 && <line x1={P.x} y1={P.y} x2={H1.x} y2={H1.y} className="mm-route to-hospital" />}
        </>
      )}
      {hospitals.map((h) => {
        const p = xy(h);
        const on = h.id === hospitalId;
        return (
          <g key={h.id} className={`mm-hospital${on ? " on" : ""}`}>
            <rect x={p.x - 7} y={p.y - 7} width="14" height="14" rx="3" />
            <path d={`M${p.x - 4} ${p.y}H${p.x + 4}M${p.x} ${p.y - 4}V${p.y + 4}`} className="mm-cross" />
            {on && <text x={p.x + 11} y={p.y + 4}>{label(h.short)}</text>}
            <title>{h.short}</title>
          </g>
        );
      })}
      {!track && responders.map((r) => {
        const p = xy(r);
        const on = r.id === responderId;
        return (
          <g key={r.id} className={`mm-responder${on ? " on" : ""}`}>
            <circle cx={p.x} cy={p.y} r={on ? 6 : 4} />
            {on && <text x={p.x + 10} y={p.y - 8}>{label(r.name.replace(/^Demo Responder \d+ \((.*)\)$/, "$1"))}</text>}
          </g>
        );
      })}
      {track && (() => {
        const C = xy(track.position);
        return (
          <g className="mm-vehicle">
            <circle cx={C.x} cy={C.y} r="13" className="mm-pulse" />
            <circle cx={C.x} cy={C.y} r="7" />
            <text x={C.x + 12} y={C.y - 10}>{label(firstName(track.responder))}</text>
          </g>
        );
      })()}
      <g className="mm-patient">
        <circle cx={P.x} cy={P.y} r="14" className="mm-pulse" />
        <circle cx={P.x} cy={P.y} r="6" />
        <text x={P.x + 12} y={P.y + 18}>Patient</text>
      </g>
    </svg>
  );
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
  const [track, setTrack] = useState<Track | null>(null);
  const [copied, setCopied] = useState(false);

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

  const dispatchId = t?.dispatch?.id;
  const tripLive = t?.dispatch && t.dispatch.status !== "cancelled";
  const tripActive = t?.dispatch && (t.dispatch.status === "dispatched" || t.dispatch.status === "reached_patient");
  useEffect(() => {
    if (!dispatchId || !tripLive) {
      setTrack(null);
      return;
    }
    let stop = false;
    const tick = () =>
      api
        .track(dispatchId)
        .then((x) => !stop && setTrack(x))
        .catch(() => {});
    tick();
    if (!tripActive) return () => void (stop = true);
    const timer = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [dispatchId, tripLive, tripActive, t?.dispatch?.status]);

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
          {error && (
            <div className="error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
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

          <MiniMap
            patient={loc}
            hospitals={t.hospitals}
            hospitalId={d ? d.hospital_id : hospitalId}
            responders={d ? [d.responder] : t.responders.slice(0, 3)}
            responderId={d ? d.responder.id : responderId}
            track={d && d.status !== "cancelled" ? track : null}
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
              {track && d.status !== "cancelled" && (
                <LiveTracker track={track} />
              )}
              <p>
                <b>{d.responder.name}</b> ({d.responder.vehicle}) →{" "}
                <b>{d.hospital_name}</b>
                {d.status === "cancelled" ? " · cancelled" : ""}
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
              {active && d.tracking_link && (
                <div className="share-link">
                  <span>
                    Responder&apos;s tracking link: open it on their phone to share live location.
                  </span>
                  <div>
                    <button
                      className="btn btn-quiet"
                      onClick={() => {
                        navigator.clipboard
                          ?.writeText(d.tracking_link)
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          })
                          .catch(() => {});
                      }}
                    >
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <a className="btn btn-quiet" href={d.tracking_link} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {t.out_of_area && !d && (
            <div className="out-of-area">
              <b>Outside the service area.</b> This patient is about {Math.round(t.nearest_hospital_km ?? 0)} km from the
              nearest partner hospital in Multan, so no responder can be sent. Call them back and tell them to call{" "}
              <b>Rescue 1122</b>, which covers all of Punjab.
              <a className="btn btn-danger" href="tel:1122">
                1122
              </a>
            </div>
          )}

          {!active && d?.status !== "at_hospital" && !t.out_of_area && (
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
                {t.responders.length === 0 && <p className="muted">No free responder nearby. Call 1122.</p>}
                {t.responders_too_far > 0 && (
                  <p className="muted small">
                    {t.responders_too_far} online {t.responders_too_far === 1 ? "ambulance is" : "ambulances are"} more than 40 km
                    away, so not shown.
                  </p>
                )}
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

function LiveTracker({ track }: { track: Track }) {
  const who = firstName(track.responder);
  const hospital = track.hospital.replace(/^Ch\. Pervaiz Elahi /, "");
  const headline =
    track.phase === "to_patient"
      ? `${who} is ${track.km_to_patient.toFixed(1)} km from the patient, about ${Math.max(1, track.eta_patient_min)} min away`
      : track.phase === "waiting_at_patient"
        ? `${who} has reached the patient`
        : track.phase === "to_hospital"
          ? `Patient on the way: ${track.km_to_hospital.toFixed(1)} km from ${hospital}, arriving in about ${Math.max(1, track.eta_hospital_min)} min`
          : `Patient has arrived at ${hospital}`;
  const sub =
    track.phase === "to_patient" || track.phase === "waiting_at_patient"
      ? `Then ${track.km_to_hospital.toFixed(1)} km to ${hospital} (about ${track.eta_hospital_min} min in total)`
      : null;
  const badge =
    track.mode === "live"
      ? { cls: "live", text: `Live GPS · updated ${track.last_fix_seconds ?? 0}s ago` }
      : track.mode === "simulated"
        ? { cls: "sim", text: "Demo simulation (sped up)" }
        : track.mode === "no_signal"
          ? { cls: "wait", text: "Waiting for the responder's phone. Send them the tracking link." }
          : null;
  // Patient pickup sits part-way along the bar, in proportion to the two legs.
  const leg1 = Math.max(0.05, Math.min(0.95, pickupShare(track)));
  return (
    <div className={`tracker phase-${track.phase}`} aria-live="polite">
      <p className="tracker-head">{headline}</p>
      {sub && <p className="muted tracker-sub">{sub}</p>}
      <div className="tracker-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(track.progress * 100)}>
        <span className="fill" style={{ width: `${track.progress * 100}%` }} />
        <span className="stop start" style={{ left: "0%" }} title="Responder" />
        <span className="stop pickup" style={{ left: `${leg1 * 100}%` }} title="Patient" />
        <span className="stop end" style={{ left: "100%" }} title="Hospital" />
        <span className="vehicle" style={{ left: `${track.progress * 100}%` }} />
      </div>
      <div className="tracker-labels">
        <span>{leg1 < 0.18 ? "Responder · Patient" : "Responder"}</span>
        {leg1 >= 0.18 && leg1 <= 0.82 && <span style={{ left: `${leg1 * 100}%` }}>Patient</span>}
        <span>{leg1 > 0.82 ? "Patient · Hospital" : "Hospital"}</span>
      </div>
      {badge && <span className={`track-badge ${badge.cls}`}>{badge.text}</span>}
    </div>
  );
}

function pickupShare(t: Track) {
  const d = (a: Pt, b: Pt) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));
  const l1 = d(t.start, t.patient);
  const l2 = d(t.patient, t.hospital_position);
  return l1 + l2 > 0 ? l1 / (l1 + l2) : 0.5;
}
