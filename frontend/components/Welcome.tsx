"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadLang, saveLang, type UiLang } from "../lib/patientText";
import { useSession } from "../lib/useSession";
import InstallApp from "./InstallApp";
import { LogoMark } from "./Logo";
import { useEffect, useState } from "react";

const W = {
  en: {
    tagline: "Your health helper, in your language",
    sub: "Tell us what's wrong by voice or text. A doctor checks every request.",
    help: "I need help now",
    helpSub: "No account needed",
    patient: "Patient login",
    patientSub: "See your requests and bookings",
    newAcc: "New? Create a free account",
    staff: "Hospital / Doctor login",
    firstAid: "First aid videos: what to do in an emergency",
    donate: "Donate blood",
    alerts: "Area alerts",
    meds: "Medicine reminders",
    family: "Family check-ins",
    cont: (n: string) => `Continue as ${n}`,
    notYou: "Not you? Log out",
    sos: "Emergency? Chest pain, can't breathe, unconscious:",
    call: "Call 1122",
    foot: "Free for patients · Sehat Saathi never diagnoses · A doctor decides",
    switchTo: "اردو",
  },
  ur: {
    tagline: "آپ کا صحت ساتھی، آپ کی زبان میں",
    sub: "اپنی تکلیف بول کر یا لکھ کر بتائیں۔ ہر درخواست ڈاکٹر دیکھتا ہے۔",
    help: "مجھے ابھی مدد چاہیے",
    helpSub: "اکاؤنٹ کی ضرورت نہیں",
    patient: "مریض لاگ ان",
    patientSub: "اپنی درخواستیں اور وقت دیکھیں",
    newAcc: "نئے ہیں؟ مفت اکاؤنٹ بنائیں",
    staff: "ہسپتال / ڈاکٹر لاگ ان",
    firstAid: "ابتدائی طبی امداد کی ویڈیوز: ایمرجنسی میں کیا کریں",
    donate: "خون کا عطیہ",
    alerts: "علاقے کے الرٹس",
    meds: "دوا کی یاد دہانی",
    family: "گھر والوں کی خیریت",
    cont: (n: string) => `${n} کے طور پر جاری رکھیں`,
    notYou: "آپ نہیں؟ لاگ آؤٹ کریں",
    sos: "ایمرجنسی؟ سینے میں درد، سانس میں تکلیف، بے ہوشی:",
    call: "1122 پر کال کریں",
    foot: "مریضوں کے لیے مفت · صحت ساتھی تشخیص نہیں کرتا · فیصلہ ڈاکٹر کرتا ہے",
    switchTo: "English",
  },
};

/** The app's opening screen: who are you and what do you need. Login comes only after a choice. */
export default function Welcome() {
  const router = useRouter();
  const { session, logout } = useSession();
  const [lang, setLang] = useState<UiLang>("ur");
  useEffect(() => setLang(loadLang()), []);
  const t = W[lang];
  const home = session ? (session.account.role === "patient" ? "/patient/home" : "/desk") : null;

  return (
    <main className="welcome" dir={lang === "ur" ? "rtl" : "ltr"} lang={lang}>
      <button
        type="button"
        className="welcome-lang"
        onClick={() => {
          const l = lang === "ur" ? "en" : "ur";
          setLang(l);
          saveLang(l);
        }}
      >
        {t.switchTo}
      </button>

      <section className="welcome-sos">
        <span>{t.sos}</span>
        <a href="tel:1122">{t.call}</a>
      </section>

      <section className="welcome-hero">
        <div className="welcome-mark">
          <LogoMark size={64} />
        </div>
        <h1>
          <span className="welcome-en">Sehat Saathi</span>
          <span className="welcome-ur urdu">صحت ساتھی</span>
        </h1>
        <svg className="welcome-pulse" viewBox="0 0 240 28" aria-hidden>
          <path d="M0 14h70l10-10 14 20 12-16 8 6h126" />
        </svg>
        <p className="welcome-tag">{t.tagline}</p>
        <p className="welcome-sub">{t.sub}</p>
      </section>

      <section className="welcome-actions">
        {session && home && (
          <div className="welcome-cont">
            <Link className="welcome-btn primary" href={home}>
              {t.cont(session.account.name)}
            </Link>
            <button type="button" className="link-btn" onClick={logout}>
              {t.notYou}
            </button>
          </div>
        )}
        <Link className={`welcome-btn ${session ? "" : "primary"}`} href="/patient">
          <b>{t.help}</b>
          <small>{t.helpSub}</small>
        </Link>
        {!session && (
          <>
            <Link className="welcome-btn" href="/login">
              <b>{t.patient}</b>
              <small>{t.patientSub}</small>
            </Link>
            <Link className="welcome-btn quiet" href="/login?as=staff">
              <b>{t.staff}</b>
            </Link>
            <button type="button" className="link-btn welcome-new" onClick={() => router.push("/login?new=1")}>
              {t.newAcc}
            </button>
          </>
        )}
        <Link className="welcome-btn quiet" href="/first-aid">
          <b>🩺 {t.firstAid}</b>
        </Link>
        <nav className="welcome-tiles">
          <Link href="/donate">🩸 {t.donate}</Link>
          <Link href="/alerts">📢 {t.alerts}</Link>
          <Link href="/patient/medicines">💊 {t.meds}</Link>
          <Link href="/patient/family">👵 {t.family}</Link>
        </nav>
      </section>

      <div className="patient welcome-install">
        <InstallApp lang={lang} />
      </div>

      <p className="welcome-foot">{t.foot}</p>
      <p className="welcome-foot">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/hospitals/join">For hospitals</Link>
      </p>
    </main>
  );
}
