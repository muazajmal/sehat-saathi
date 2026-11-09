"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiCall, ApiError, type MyCase } from "../lib/api";
import { cx, type InboxItem } from "../lib/community";
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
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const t = T[lang];
  const h = H[lang];

  useEffect(() => {
    if (!ready) return;
    if (!session || session.account.role !== "patient") {
      router.replace("/login");
      return;
    }
    cx.inbox().then(setInbox).catch(() => {});
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

      <nav className="tiles" aria-label="Sehat Saathi">
        <Link href="/patient/medicines"><span aria-hidden>💊</span>{lang === "ur" ? "میری دوائیں" : "My medicines"}</Link>
        <Link href="/patient/family"><span aria-hidden>👵</span>{lang === "ur" ? "گھر والوں کی خیریت" : "Family check-ins"}</Link>
        <Link href="/donate"><span aria-hidden>🩸</span>{lang === "ur" ? "خون کا عطیہ" : "Donate blood"}</Link>
        <Link href="/alerts"><span aria-hidden>📢</span>{lang === "ur" ? "علاقے کے الرٹس" : "Area alerts"}</Link>
        <Link href="/first-aid"><span aria-hidden>🩺</span>{lang === "ur" ? "ابتدائی طبی امداد" : "First aid"}</Link>
        <Link href="/patient"><span aria-hidden>➕</span>{lang === "ur" ? "نئی درخواست" : "New request"}</Link>
      </nav>

      {inbox.length > 0 && (
        <section className="p-card">
          <h2>{lang === "ur" ? "پیغامات" : "Messages"} {inbox.some((n) => !n.read) && <span className="dot-new" aria-label="new" />}</h2>
          <ul className="inbox">
            {inbox.slice(0, 6).map((n) => (
              <li key={n.id} className={n.read ? "" : "unread"}>
                <Link href={n.link || "#"} onClick={() => cx.inboxRead().catch(() => {})}>
                  <b dir="auto">{lang === "ur" && n.title_ur ? n.title_ur : n.title}</b>
                  {(lang === "ur" && n.title_ur ? n.body_ur : n.body) && <span dir="auto">{lang === "ur" && n.title_ur ? n.body_ur : n.body}</span>}
                  <small>{when(n.created_at)}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
      <p className="p-foot">
        <button
          type="button"
          className="link-btn"
          onClick={async () => {
            const pw = window.prompt(lang === "ur"
              ? "اکاؤنٹ اور ڈیٹا مستقل طور پر حذف ہو جائے گا۔ تصدیق کے لیے اپنا پاس ورڈ لکھیں:"
              : "This permanently deletes your account and personal data. Type your password to confirm:");
            if (!pw) return;
            try {
              await apiCall("/api/me/delete", { method: "POST", body: JSON.stringify({ password: pw }) });
              logout();
              router.push("/app");
            } catch (e) {
              window.alert(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {lang === "ur" ? "میرا اکاؤنٹ اور ڈیٹا حذف کریں" : "Delete my account and data"}
        </button>{" "}
        · <Link href="/privacy">{lang === "ur" ? "پرائیویسی" : "Privacy"}</Link>
      </p>
      <p className="p-foot">{t.notDiagnosis}</p>
    </main>
  );
}
