"use client";

import type { Pt } from "../lib/api";

type Phase = "to_patient" | "waiting_at_patient" | "to_hospital" | "at_hospital" | "cancelled";

/**
 * A small live map with no map service (free, works on slow internet): the route from the
 * responder's start to the patient and on to the hospital, with the ambulance gliding along it
 * between the 5-second updates.
 */
export default function TripMap({
  start,
  patient,
  hospital,
  position,
  phase,
  hospitalName,
  youLabel = "You",
}: {
  start: Pt;
  patient: Pt;
  hospital: Pt;
  position: Pt;
  phase: Phase;
  hospitalName: string;
  youLabel?: string;
}) {
  const W = 400;
  const H = 240;
  const pts = [start, patient, hospital, position];
  const k = Math.cos((patient.lat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k);
  const ys = pts.map((p) => p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, ((y1 - y0) * W) / H, 0.004);
  const scale = (W * 0.72) / span;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const P = (p: Pt) => ({ x: W / 2 + (p.lng * k - cx) * scale, y: H / 2 - (p.lat - cy) * scale });
  const S = P(start);
  const Y = P(patient);
  const Ho = P(hospital);
  const A = P(position);
  const pastPatient = phase === "to_hospital" || phase === "at_hospital";
  const done = pastPatient ? `${S.x},${S.y} ${Y.x},${Y.y} ${A.x},${A.y}` : `${S.x},${S.y} ${A.x},${A.y}`;
  const short = hospitalName.replace(/\(.*\)/, "").trim().split(" ").slice(0, 3).join(" ");

  return (
    <svg className="trip-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${short}: live position`}>
      <defs>
        <pattern id="tm-grid" width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0H0V22" fill="none" stroke="rgba(150,230,210,.07)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} rx="16" fill="#061413" />
      <rect width={W} height={H} rx="16" fill="url(#tm-grid)" />
      {/* a few faint streets, for the feel of a city map */}
      <g stroke="rgba(150,230,210,.09)" strokeWidth="7" fill="none" strokeLinecap="round">
        <path d="M-10 70 C 90 60, 160 110, 410 90" />
        <path d="M-10 190 C 120 170, 230 210, 410 160" />
        <path d="M120 -10 C 130 80, 100 160, 140 250" />
        <path d="M290 -10 C 270 90, 320 170, 300 250" />
      </g>
      {/* planned route */}
      <polyline points={`${S.x},${S.y} ${Y.x},${Y.y} ${Ho.x},${Ho.y}`} fill="none" stroke="rgba(234,245,242,.35)" strokeWidth="3" strokeDasharray="6 7" strokeLinecap="round" />
      {/* travelled so far */}
      <polyline className="tm-done" points={done} fill="none" stroke="#5fe3c4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

      <circle cx={S.x} cy={S.y} r="5" fill="#8ea7a1" />

      <g transform={`translate(${Ho.x} ${Ho.y})`}>
        <rect x="-15" y="-15" width="30" height="30" rx="8" fill="#0e2a26" stroke="#38c8f0" strokeWidth="2" />
        <text textAnchor="middle" dominantBaseline="central" fontSize="16">🏥</text>
        <text y="30" textAnchor="middle" fontSize="12" fill="#cfe7e1" fontWeight="600">{short}</text>
      </g>

      <g transform={`translate(${Y.x} ${Y.y})`}>
        {!pastPatient && <circle className="tm-pulse" r="10" fill="none" stroke="#ff7a83" strokeWidth="2" />}
        <circle r="8" fill="#ff7a83" stroke="#2a0508" strokeWidth="2" />
        <text y="-16" textAnchor="middle" fontSize="13" fill="#ffd7da" fontWeight="700">{youLabel}</text>
      </g>

      <g className="tm-amb" style={{ transform: `translate(${A.x}px, ${A.y}px)` }}>
        <circle r="17" fill="#5fe3c4" opacity=".2" />
        <circle r="13" fill="#eaf5f2" stroke="#5fe3c4" strokeWidth="2.5" />
        <text textAnchor="middle" dominantBaseline="central" fontSize="15">🚑</text>
      </g>
    </svg>
  );
}
