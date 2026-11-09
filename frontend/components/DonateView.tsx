"use client";

import { useEffect, useState } from "react";
import { ApiError, session as stored } from "../lib/api";
import { BLOOD_GROUPS, cx, enablePush, type BloodGroup, type DonorT } from "../lib/community";
import type { UiLang } from "../lib/patientText";
import PatientFrame, { L } from "./PatientFrame";

const AREAS = ["Gulgasht Colony", "Bosan Road", "Shah Rukn-e-Alam Colony", "Mumtazabad", "Multan Cantt", "New Multan",
  "Model Town", "Hussain Agahi / Old City", "Chungi No. 9", "Qasim Bela"];

export default function DonateView() {
  return <PatientFrame>{(lang) => <Donate lang={lang} />}</PatientFrame>;
}

function Donate({ lang }: { lang: UiLang }) {
  const [form, setForm] = useState({ name: "", phone: "", blood_group: "" as BloodGroup | "", area: "", last_donated: "", eligible: false });
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [donor, setDonor] = useState<DonorT | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<string | null>(null);

  useEffect(() => {
    const s = stored.get();
    if (s && s.account.role === "patient") {
      setForm((f) => ({ ...f, name: s.account.name, phone: "0" + s.account.phone.replace(/^\+92/, "") }));
      cx.myDonor().then((d) => d && setDonor(d)).catch(() => {});
    }
  }, []);

  if (donor)
    return (
      <section className="p-card">
        <h1>🩸 {L(lang, "Thank you for joining", "شامل ہونے کا شکریہ")}</h1>
        <p className="donor-badge">{donor.blood_group}</p>
        <p className="p-muted">
          {L(lang, `${donor.name}, when a hospital near ${donor.area || "you"} needs blood your group (${donor.blood_group}) can give, you'll get a request. Say yes or no: no pressure. Your number is only shared with the hospital after you say yes.`,
            `${donor.name}، جب ${donor.area || "آپ"} کے قریب کسی ہسپتال کو آپ کے گروپ کا خون چاہیے ہوگا، آپ کو درخواست آئے گی۔ ہاں یا نہ کہیں، کوئی دباؤ نہیں۔ آپ کا نمبر ہاں کہنے کے بعد ہی ہسپتال کو دیا جاتا ہے۔`)}
        </p>
        {push !== "on" ? (
          <button type="button" className="btn btn-primary p-submit" onClick={async () => setPush(await enablePush({ donor_token: donor.token }))}>
            🔔 {L(lang, "Get requests on this phone", "اس فون پر درخواستیں حاصل کریں")}
          </button>
        ) : (
          <p className="p-ok">✓ {L(lang, "Requests will come to this phone.", "درخواستیں اس فون پر آئیں گی۔")}</p>
        )}
      </section>
    );

  return (
    <form
      className="p-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setDonor(await cx.donorSignup({ ...form, blood_group: form.blood_group as BloodGroup, last_donated: form.last_donated || null, ...(pos ?? {}) }));
        } catch (x) {
          setError(x instanceof ApiError ? x.message : String(x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1>🩸 {L(lang, "Become a blood donor", "خون کا عطیہ دینے والے بنیں")}</h1>
      <p className="p-muted">
        {L(lang, "Join your neighbourhood's donor list. When someone nearby needs your blood group, you'll be asked first.",
          "اپنے علاقے کی ڈونر لسٹ میں شامل ہوں۔ جب قریب کسی کو آپ کے گروپ کا خون چاہیے ہوگا، پہلے آپ سے پوچھا جائے گا۔")}
      </p>
      <label htmlFor="d-name">{L(lang, "Your name", "آپ کا نام")}</label>
      <input id="d-name" dir="auto" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <label htmlFor="d-phone">{L(lang, "Phone", "فون")}</label>
      <input id="d-phone" inputMode="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0300 1234567" />
      <label>{L(lang, "Blood group", "بلڈ گروپ")}</label>
      <div className="chips groups">
        {BLOOD_GROUPS.map((g) => (
          <button key={g} type="button" aria-pressed={form.blood_group === g} onClick={() => setForm({ ...form, blood_group: g })}>{g}</button>
        ))}
      </div>
      <label htmlFor="d-area">{L(lang, "Your area", "آپ کا علاقہ")}</label>
      <select id="d-area" className="p-select" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
        <option value="">{L(lang, "Choose…", "منتخب کریں…")}</option>
        {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <button type="button" className="btn btn-quiet p-submit" onClick={() =>
        navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {})}>
        📍 {pos ? L(lang, "Location added ✓", "لوکیشن شامل ✓") : L(lang, "Use my location instead", "میری لوکیشن استعمال کریں")}
      </button>
      <label htmlFor="d-last">{L(lang, "Last time you gave blood (if ever)", "آخری بار خون کب دیا (اگر دیا ہو)")}</label>
      <input id="d-last" type="date" value={form.last_donated} onChange={(e) => setForm({ ...form, last_donated: e.target.value })} />
      <label className="p-consent">
        <input type="checkbox" checked={form.eligible} onChange={(e) => setForm({ ...form, eligible: e.target.checked })} />
        <span>{L(lang, "I am 18 to 60 years old, weigh over 50 kg and am in good health. The blood bank will still check me before donating.",
          "میری عمر 18 سے 60 سال ہے، وزن 50 کلو سے زیادہ ہے اور صحت ٹھیک ہے۔ عطیے سے پہلے بلڈ بینک خود بھی چیک کرے گا۔")}</span>
      </label>
      {error && <div className="error">{error}</div>}
      <button className="btn btn-primary p-submit" type="submit"
        disabled={busy || form.name.trim().length < 2 || form.phone.trim().length < 6 || !form.blood_group || !form.eligible || (!form.area && !pos)}>
        {busy ? "…" : L(lang, "Join the donor list", "ڈونر لسٹ میں شامل ہوں")}
      </button>
    </form>
  );
}
