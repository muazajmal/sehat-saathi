"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiCall, ApiError, session, type Prices } from "../lib/api";
import { loadLang, myRequests, rememberRequest, saveLang, T, type MyRequest, type UiLang } from "../lib/patientText";
import { composeMessage, EMPTY_QUICK, hasQuick, QT, quickPayload, type QuickState } from "../lib/quickText";
import InstallApp from "./InstallApp";
import Logo from "./Logo";
import QuickPick from "./QuickPick";
import VoiceButton from "./VoiceButton";

// Pakistani mobile numbers: 03xx xxxxxxx, +92 3xx xxxxxxx or 92 3xx…
export function normalisePhone(raw: string): string | null {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^03\d{9}$/.test(d)) return "+92" + d.slice(1);
  if (/^\+923\d{9}$/.test(d)) return d;
  if (/^923\d{9}$/.test(d)) return "+" + d;
  if (/^\+\d{8,15}$/.test(d)) return d; // other countries
  return null;
}

export function PatientHeader({ lang, onLang, clinic }: { lang: UiLang; onLang: (l: UiLang) => void; clinic: string }) {
  return (
    <header className="p-top">
      <Logo href="/patient" urdu={false} />
      <span className="p-clinic" dir="auto">
        {clinic}
      </span>
      <MyAccountLink lang={lang} />
      <button className="p-lang" type="button" onClick={() => onLang(lang === "ur" ? "en" : "ur")}>
        {T[lang].switchTo}
      </button>
    </header>
  );
}

function MyAccountLink({ lang }: { lang: UiLang }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const s = session.get();
    setName(s && s.account.role === "patient" ? s.account.name : "");
  }, []);
  if (name === null) return null;
  return (
    <Link className="p-top-login" href={name ? "/patient/home" : "/login"}>
      {name ? (lang === "ur" ? "میری درخواستیں" : "My requests") : lang === "ur" ? "لاگ ان" : "Log in"}
    </Link>
  );
}

export function EmergencyBar({ lang }: { lang: UiLang }) {
  const t = T[lang];
  return (
    <section className="p-sos" aria-label={t.emergencyTitle}>
      <div>
        <b>{t.emergencyTitle}</b> {t.emergencyBody}
      </div>
      <a className="p-sos-btn" href="tel:1122">
        {t.call1122}
      </a>
    </section>
  );
}

export function usePatientLang() {
  const [lang, setLang] = useState<UiLang>("ur");
  useEffect(() => setLang(loadLang()), []);
  return [
    lang,
    (l: UiLang) => {
      setLang(l);
      saveLang(l);
    },
  ] as const;
}

export function useClinicName() {
  const [clinic, setClinic] = useState("");
  useEffect(() => {
    api
      .health()
      .then((h) => setClinic(h.clinic))
      .catch(() => {});
  }, []);
  return clinic;
}

export default function PatientPortal() {
  const router = useRouter();
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const t = T[lang];
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot: people never fill this in
  const [email, setEmail] = useState("");
  const [tenants, setTenants] = useState<{ id: number; slug: string; name: string; city: string }[]>([]);
  const [hospital, setHospital] = useState("");
  // Which hospital: from the link (?h=slug), the last one used, or the main one.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("h");
    let saved = "";
    try {
      saved = localStorage.getItem("sehat.hospital") ?? "";
    } catch {}
    apiCall<{ id: number; slug: string; name: string; city: string }[]>("/api/tenants")
      .then((list) => {
        setTenants(list);
        const pick = [fromLink, saved].find((x) => x && list.some((t) => t.slug === x)) ?? list[0]?.slug ?? "";
        setHospital(pick);
      })
      .catch(() => {});
  }, []);
  // Logged-in patients don't need to type their name and number again.
  useEffect(() => {
    const s = session.get();
    if (s && s.account.role === "patient") {
      setName(s.account.name);
      setPhone("0" + s.account.phone.replace(/^\+92/, ""));
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyRequest[]>([]);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [quick, setQuick] = useState<QuickState>(EMPTY_QUICK);
  const ready = message.trim().length >= 3 || hasQuick(quick);

  useEffect(() => {
    setMine(myRequests());
    api.prices().then(setPrices).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (website) return;
    const p = normalisePhone(phone);
    if (!p) {
      setError(t.phoneInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const full = composeMessage(quick, lang, message);
      try {
        localStorage.setItem("sehat.hospital", hospital);
      } catch {}
      const c = await api.intake(p, name.trim(), full, quickPayload(quick), email.trim(), hospital);
      rememberRequest({ c: c.id, t: c.access_token, at: c.created_at, preview: full.slice(0, 60) });
      router.push(`/patient/status?c=${c.id}&t=${encodeURIComponent(c.access_token)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again, or call 1122 if it is an emergency.");
      setBusy(false);
    }
  }

  return (
    <main className="patient" dir={t.dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      <EmergencyBar lang={lang} />

      <form className="p-card" onSubmit={submit}>
        <h1>{t.formTitle}</h1>
        {tenants.length > 1 && (
          <>
            <label htmlFor="p-hosp">{lang === "ur" ? "کس ہسپتال کو بھیجیں؟" : "Which hospital?"}</label>
            <select id="p-hosp" className="p-select" value={hospital} onChange={(e) => setHospital(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name} · {t.city}</option>
              ))}
            </select>
          </>
        )}
        <QuickPick lang={lang} value={quick} onChange={setQuick} />
        <h2 className="qp-or">{QT[lang].orWrite}</h2>
        <p className="p-muted">{t.formHint}</p>
        <VoiceButton lang={lang} onText={(said) => setMessage((m) => (m.trim() ? `${m.trim()}\n${said}` : said))} />
        <textarea
          className={lang === "ur" ? "urdu-input" : ""}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t.placeholder}
          dir="auto"
          rows={4}
          maxLength={2000}
          aria-label={t.formTitle}
        />
        <label htmlFor="p-name">{t.name}</label>
        <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" dir="auto" maxLength={100} />
        <label htmlFor="p-phone">{t.phone}</label>
        <input
          id="p-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0300 1234567"
          dir="ltr"
          required
        />
        <p className="p-muted small">{t.phoneHint}</p>
        <label htmlFor="p-email">{lang === "ur" ? "ای میل (اختیاری)" : "Email (optional)"}</label>
        <input
          id="p-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          autoComplete="email"
          placeholder="name@gmail.com"
          dir="ltr"
          maxLength={200}
        />
        <p className="p-muted small">
          {lang === "ur"
            ? "ڈاکٹر وقت کنفرم کرے تو آپ کو ای میل آئے گی۔"
            : "We'll email you when a doctor confirms your appointment."}
        </p>
        <input
          className="hp"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          aria-hidden="true"
          name="website"
        />
        <label className="p-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>{t.consent(clinic || "Sehat Saathi")}</span>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary p-submit" type="submit" disabled={busy || !consent || !ready || !phone.trim()}>
          {busy ? t.sending : t.submit}
        </button>
        <p className="p-muted small">{t.trust}</p>
        {prices && <p className="p-muted small">{t.freeNote(prices.transport_base_pkr, prices.transport_per_km_pkr)}</p>}
      </form>

      {mine.length > 0 && (
        <section className="p-card">
          <h2>{t.previous}</h2>
          <ul className="p-mine">
            {mine.map((r) => (
              <li key={r.c}>
                <Link href={`/patient/status?c=${r.c}&t=${encodeURIComponent(r.t)}`} dir="auto">
                  {r.preview || `#${r.c}`}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InstallApp lang={lang} />
      <p className="p-foot">{t.notDiagnosis}</p>
    </main>
  );
}
