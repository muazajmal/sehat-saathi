"use client";

import type { ReactNode } from "react";
import { T, type UiLang } from "../lib/patientText";
import { EmergencyBar, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

/** Header + emergency bar + page, in the patient's language. */
export default function PatientFrame({ children }: { children: (lang: UiLang) => ReactNode }) {
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  return (
    <main className="patient" dir={T[lang].dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      <EmergencyBar lang={lang} />
      {children(lang)}
      <p className="p-foot">{T[lang].notDiagnosis}</p>
    </main>
  );
}

export const L = (lang: UiLang, en: string, ur: string) => (lang === "ur" ? ur : en);
