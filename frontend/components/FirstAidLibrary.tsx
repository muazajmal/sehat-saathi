"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AT, GUIDES, guide } from "../lib/firstAid";
import { T } from "../lib/patientText";
import FirstAidPlayer from "./FirstAidPlayer";
import { EmergencyBar, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

/** All first-aid guides in one place, for anyone, no account needed. */
// One clear picture per emergency for the menu (the steps keep their own pictures).
const TILE: Record<string, string> = {
  heart: "🫀", unconscious: "😵", choking: "✋", bleeding: "🩸", seizure: "⚡", burns: "🔥", stroke: "🧠", breathing: "🫁",
};

export default function FirstAidLibrary() {
  const params = useSearchParams();
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const t = AT[lang];
  const [active, setActive] = useState<string | null>(params.get("g"));
  const playerRef = useRef<HTMLDivElement>(null);
  const g = active ? guide(active) : undefined;

  useEffect(() => {
    if (g) playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [g]);

  return (
    <main className="patient" dir={T[lang].dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      <EmergencyBar lang={lang} />
      <section className="p-card">
        <h1>{t.library}</h1>
        <p className="p-muted">{t.librarySub}</p>
        <h2>{t.choose}</h2>
        <div className="fa-grid">
          {GUIDES.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === active} onClick={() => setActive(x.key)}>
              <span aria-hidden>{TILE[x.key] ?? x.steps[0].icon}</span>
              {x.title[lang]}
            </button>
          ))}
        </div>
      </section>
      {g && (
        <section className="p-card" ref={playerRef}>
          <h2>{g.title[lang]}</h2>
          <FirstAidPlayer guide={g} lang={lang} onOpen={setActive} />
        </section>
      )}
      <p className="p-foot">{T[lang].notDiagnosis}</p>
    </main>
  );
}
