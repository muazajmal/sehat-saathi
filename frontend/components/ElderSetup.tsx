"use client";

import { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { BLOOD_GROUPS, cx, type ElderProfileT, type ElderT } from "../lib/community";
import type { UiLang } from "../lib/patientText";
import { L } from "./PatientFrame";

/** Family sets up the elder's emergency button: sign-in PIN, medical card, extra guardians. */
export default function ElderSetup({ elder, lang }: { elder: ElderT; lang: UiLang }) {
  const [p, setP] = useState<ElderProfileT | null>(null);
  const [card, setCard] = useState({ pin: "", age: 0, conditions: "", medicines: "", allergies: "", blood_group: "" });
  const [g, setG] = useState({ name: "", relation: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cx.elderProfile(elder.id).then((x) => {
      setP(x);
      setCard({ pin: "", age: x.age, conditions: x.conditions, medicines: x.medicines, allergies: x.allergies, blood_group: x.blood_group });
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [elder.id]);

  async function run(fn: () => Promise<ElderProfileT>, ok: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      setP(await fn());
      setMsg(ok);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const signLink = `${origin}/elder?${elder.link.split("?")[1] ?? ""}`;

  if (!p) return <div className="el-setup">{error ? <div className="error">{error}</div> : <p className="p-muted">…</p>}</div>;
  return (
    <div className="el-setup">
      <h3>{L(lang, "1. Their sign-in", "1. ان کا سائن اِن")}</h3>
      <p className="p-muted small">
        {p.has_pin
          ? L(lang, `PIN is set. On their phone open ${origin}/elder and sign in with ${elder.phone || "their number"} and the PIN.`,
              `PIN بن گیا ہے۔ ان کے فون پر ${origin}/elder کھولیں اور ${elder.phone || "ان کے نمبر"} اور PIN سے سائن اِن کریں۔`)
          : L(lang, "Choose a 4-digit PIN they can remember. They sign in with their phone number and this PIN.",
              "4 ہندسوں کا PIN چنیں جو انہیں یاد رہے۔ وہ اپنے فون نمبر اور اس PIN سے سائن اِن کریں گے۔")}
      </p>
      <div className="el-row">
        <input inputMode="numeric" maxLength={4} pattern="\d{4}" dir="ltr" aria-label="PIN" placeholder={p.has_pin ? L(lang, "New PIN", "نیا PIN") : "PIN"}
               value={card.pin} onChange={(e) => setCard({ ...card, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
        <a className="btn btn-quiet p-wa" target="_blank" rel="noreferrer"
           href={`https://wa.me/?text=${encodeURIComponent(`${L(lang, "Your Sehat Saathi help button (opens signed in)", "آپ کا صحت ساتھی مدد کا بٹن")}: ${signLink}`)}`}>
          {L(lang, "Send sign-in link", "سائن اِن لنک بھیجیں")}
        </a>
      </div>

      <h3>{L(lang, "2. Medical card (shown to the hospital in an emergency)", "2. میڈیکل کارڈ (ایمرجنسی میں ہسپتال کو دکھایا جاتا ہے)")}</h3>
      <div className="el-grid">
        <label>{L(lang, "Age", "عمر")}
          <input inputMode="numeric" value={card.age || ""} onChange={(e) => setCard({ ...card, age: Math.min(120, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
        </label>
        <label>{L(lang, "Blood group", "بلڈ گروپ")}
          <select value={card.blood_group} onChange={(e) => setCard({ ...card, blood_group: e.target.value })}>
            <option value="">{L(lang, "Don't know", "معلوم نہیں")}</option>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </div>
      <label>{L(lang, "Health conditions", "بیماریاں")}
        <input dir="auto" value={card.conditions} maxLength={300} placeholder={L(lang, "e.g. heart patient, diabetes, high BP", "مثلاً دل کے مریض، شوگر، بلڈ پریشر")}
               onChange={(e) => setCard({ ...card, conditions: e.target.value })} />
      </label>
      <label>{L(lang, "Medicines they take", "جو دوائیں لیتے ہیں")}
        <input dir="auto" value={card.medicines} maxLength={300} onChange={(e) => setCard({ ...card, medicines: e.target.value })} />
      </label>
      <label>{L(lang, "Allergies", "الرجی")}
        <input dir="auto" value={card.allergies} maxLength={200} onChange={(e) => setCard({ ...card, allergies: e.target.value })} />
      </label>
      <button type="button" className="btn btn-primary" disabled={busy || (card.pin !== "" && card.pin.length !== 4)}
              onClick={() => run(() => cx.saveElderProfile(elder.id, card), L(lang, "Saved ✓", "محفوظ ✓")).then((ok) => ok && setCard((c) => ({ ...c, pin: "" })))}>
        {L(lang, "Save", "محفوظ کریں")}
      </button>

      <h3>{L(lang, "3. Guardians told in an emergency", "3. ایمرجنسی میں کن کو بتایا جائے")}</h3>
      <p className="p-muted small">{L(lang, "You are always told. Add up to 4 more people (phone and/or email).", "آپ کو ہمیشہ بتایا جائے گا۔ مزید 4 لوگ شامل کریں (فون اور/یا ای میل)۔")}</p>
      <ul className="el-guards">
        {p.guardians.map((x) => (
          <li key={x.id}>
            <span><b>{x.name}</b>{x.relation ? ` · ${x.relation}` : ""}<small dir="ltr">{[x.phone, x.email].filter(Boolean).join(" · ")}</small></span>
            <button type="button" className="link-btn" disabled={busy} onClick={() => run(() => cx.removeGuardian(elder.id, x.id), L(lang, "Removed", "ہٹا دیا"))}>
              {L(lang, "Remove", "ہٹائیں")}
            </button>
          </li>
        ))}
      </ul>
      <div className="el-grid">
        <input dir="auto" placeholder={L(lang, "Name", "نام")} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
        <input dir="auto" placeholder={L(lang, "Relation (son, neighbour)", "رشتہ (بیٹا، پڑوسی)")} value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })} />
        <input inputMode="tel" dir="ltr" placeholder="0300 1234567" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />
        <input type="email" dir="ltr" placeholder="name@gmail.com" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />
      </div>
      <button type="button" className="btn btn-quiet" disabled={busy || g.name.trim().length < 2 || (!g.phone.trim() && !g.email.trim())}
              onClick={() => run(() => cx.addGuardian(elder.id, g), L(lang, "Guardian added ✓", "سرپرست شامل ✓")).then((ok) => ok && setG({ name: "", relation: "", phone: "", email: "" }))}>
        + {L(lang, "Add guardian", "سرپرست شامل کریں")}
      </button>
      {msg && <p className="p-ok">{msg}</p>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
