"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type AmbulanceMember, type VehicleType } from "../lib/api";
import { AT, rememberMember, savedMember } from "../lib/ambulanceText";
import { EmergencyBar, normalisePhone, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

const TYPES: VehicleType[] = ["basic", "oxygen", "icu", "car"];

export default function AmbulanceJoin() {
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const t = AT[lang];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [org, setOrg] = useState("");
  const [type, setType] = useState<VehicleType>("basic");
  const [reg, setReg] = useState("");
  const [area, setArea] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AmbulanceMember | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<{ m: number; t: string } | null>(null);

  useEffect(() => setSaved(savedMember()), []);

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError(AT[lang].gpsOff),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (website) return;
    const p = normalisePhone(phone);
    if (!p) return setError(t.phoneInvalid);
    setBusy(true);
    setError(null);
    try {
      const m = await api.ambulanceRegister({
        driver_name: name.trim(),
        phone: p,
        organisation: org.trim(),
        vehicle_type: type,
        vehicle_reg: reg.trim(),
        area: area.trim(),
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
        agree,
      });
      rememberMember(m.id, new URL(m.link).searchParams.get("t") ?? "");
      setDone(m);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const myPage = done ? new URL(done.link) : null;

  return (
    <main className="patient" dir={t.dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      <EmergencyBar lang={lang} />

      {done && myPage ? (
        <section className="p-card">
          <h1>{t.doneTitle}</h1>
          <p>{t.doneBody}</p>
          <p className="p-muted small">{t.saveLink}</p>
          <div className="p-save" style={{ border: 0, padding: 0, background: "none" }}>
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(done.link)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => {})
              }
            >
              {copied ? t.copied : t.copy}
            </button>
            <Link className="btn btn-primary" href={`${myPage.pathname}${myPage.search}`}>
              {t.openPage}
            </Link>
          </div>
        </section>
      ) : (
        <form className="p-card" onSubmit={submit}>
          <h1>{t.joinTitle}</h1>
          <p className="p-muted">{t.joinLede}</p>
          <ol className="a-how">
            {t.how.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>

          {saved && (
            <p className="p-muted small">
              {t.already} <Link href={`/ambulance/me?m=${saved.m}&t=${encodeURIComponent(saved.t)}`}>{t.openPage} →</Link>
            </p>
          )}

          <label htmlFor="a-name">{t.driverName}</label>
          <input id="a-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" dir="auto" required minLength={2} maxLength={120} />

          <label htmlFor="a-phone">{t.phone}</label>
          <input id="a-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0300 1234567" dir="ltr" required />

          <label htmlFor="a-org">{t.org}</label>
          <input id="a-org" value={org} onChange={(e) => setOrg(e.target.value)} dir="auto" maxLength={120} />
          <p className="p-muted small">{t.orgHint}</p>

          <fieldset className="a-types">
            <legend>{t.vehicleType}</legend>
            {TYPES.map((v) => (
              <label key={v} className={type === v ? "on" : ""}>
                <input type="radio" name="vehicle" value={v} checked={type === v} onChange={() => setType(v)} />
                <span>{t.vehicles[v]}</span>
              </label>
            ))}
          </fieldset>

          <label htmlFor="a-reg">{t.reg}</label>
          <input id="a-reg" value={reg} onChange={(e) => setReg(e.target.value)} placeholder="MNA-1234" dir="ltr" required minLength={3} maxLength={32} style={{ textTransform: "uppercase" }} />

          <label htmlFor="a-area">{t.area}</label>
          <input id="a-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder={t.areaPh} dir="auto" required minLength={2} maxLength={120} />

          <button className="p-link" type="button" onClick={locate}>
            {pos ? `✓ ${t.locationAdded}` : t.useLocation}
          </button>

          <input className="hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" name="website" />

          <label className="p-consent">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <span>{t.rules}</span>
          </label>

          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary p-submit" type="submit" disabled={busy || !agree}>
            {busy ? t.sending : t.submit}
          </button>
        </form>
      )}
    </main>
  );
}
