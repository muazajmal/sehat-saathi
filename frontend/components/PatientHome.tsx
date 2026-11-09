"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError, type MyCase } from "../lib/api";
import { T } from "../lib/patientText";
import { useSession } from "../lib/useSession";
import { EmergencyBar, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

const H = {
  en: {
    hello: (n: string) => `Assalam-o-Alaikum, ${n}`,
    sub: "Every request you sent from this phone number, and what the doctor decided.",
    newReq: "New request",
    none: "No requests yet. When you're unwell, tell us what's wrong and a doctor will check it.",
    open: "Open",
    status: { pending_review: "Waiting for the doctor", approved: "Booked", rejected: "Not booked, see the reply" },
    urgency: { urgent: "Urgent", today: "See today", routine: "Routine" },
    with: "with",
    logout: "Log out",
    loading: "Loading your requests…",
  },
  ur: {
    hello: (n: string) => `السلام علیکم، ${n}`,
    sub: "اس فون نمبر سے بھیجی گئی آپ کی تمام درخواستیں، اور ڈاکٹر کا فیصلہ۔",
    newReq: "نئی درخواست",
    none: "ابھی کوئی درخواست نہیں۔ طبیعت خراب ہو تو اپنی تکلیف بتائیں، ڈاکٹر دیکھے گا۔",
    open: "کھولیں",
    status: { pending_review: "ڈاکٹر کا انتظار", approved: "وقت طے ہو گیا", rejected: "وقت طے نہیں ہوا، جواب دیکھیں" },
    urgency: { urgent: "فوری", today: "آج", routine: "عام" },
    with: "",
    logout: "لاگ آؤٹ",
    loading: "آپ کی درخواستیں آ رہی ہیں…",
  },
};

/** The patient app: a local person's own requests, after logging in. */
export default function PatientHome() {
  const router = useRouter();
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const { session, ready, logout } = useSession();
  const [items, setItems] = useState<MyCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = T[lang];
  const h = H[lang];

  useEffect(() => {
    if (!ready) return;
    if (!session || session.account.role !== "patient") {
      router.replace("/login");
      return;
    }
    api
      .myCases()
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          logout();
          router.replace("/login");
        } else setError(e instanceof Error ? e.message : String(e));
      });
  }, [ready, session, router, logout]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "ur" ? "ur-PK" : "en-PK", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <main className="patient" dir={t.dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      <EmergencyBar lang={lang} />

      <section className="p-card">
        <h1 dir="auto">{h.hello(session?.account.name ?? "")}</h1>
        <p className="p-muted">{h.sub}</p>
        <Link className="btn btn-primary p-submit" href="/patient">
          {h.newReq}
        </Link>
      </section>

      <section className="p-card">
        <h2>{t.previous}</h2>
        {error && <div className="error">{error}</div>}
        {items === null && !error && <p className="p-muted">{h.loading}</p>}
        {items?.length === 0 && <p className="p-muted">{h.none}</p>}
        {items && items.length > 0 && (
          <ul className="p-mine">
            {items.map((c) => (
              <li key={c.case_id}>
                <Link href={`/patient/status?c=${c.case_id}&t=${encodeURIComponent(c.token)}`}>
                  <b>{h.status[c.status]}</b> · {h.urgency[c.urgency]}
                  <br />
                  <span dir="auto">{c.message}</span>
                  <br />
                  <small className="p-muted">
                    {when(c.created_at)}
                    {c.status === "approved" && c.slot ? ` · ${when(c.slot.starts_at)} ${h.with} ${c.slot.doctor}` : ""}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="p-foot">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            logout();
            router.push("/login");
          }}
        >
          {h.logout}
        </button>
      </p>
      <p className="p-foot">{t.notDiagnosis}</p>
    </main>
  );
}
