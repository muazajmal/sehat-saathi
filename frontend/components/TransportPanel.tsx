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

type Pt = { lat: number; lng: number };

// A self-drawn map: no outside map service needed, so it always works in a demo.
function MiniMap({
  patient,
  hospitals,
  hospitalId,
  responders,
  responderId,
}: {
  patient: Pt;
  hospitals: (Pt & { id: string; short: string })[];
  hospitalId: string | null;
  responders: (Pt & { id: number; name: string })[];
  responderId: number | null;
}) {
  const W = 560;
  const H = 220;
  const pad = 34;
  const all = [patient, ...hospitals, ...responders];
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
      {R1 && <line x1={R1.x} y1={R1.y} x2={P.x} y2={P.y} className="mm-route" />}
      {H1 && <line x1={P.x} y1={P.y} x2={H1.x} y2={H1.y} className="mm-route to-hospital" />}
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
      {responders.map((r) => {
        const p = xy(r);
        const on = r.id === responderId;
        return (
          <g key={r.id} className={`mm-responder${on ? " on" : ""}`}>
            <circle cx={p.x} cy={p.y} r={on ? 6 : 4} />
            {on && <text x={p.x + 10} y={p.y - 8}>{label(r.name.replace(/^Demo Responder \d+ \((.*)\)$/, "$1"))}</text>}
          </g>
        );
      })}
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
