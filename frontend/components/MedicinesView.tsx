"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "../lib/api";
import { cx, enablePush, fmtTime, type Dose, type MedDraft, type MedT } from "../lib/community";
import type { UiLang } from "../lib/patientText";
import { useSession } from "../lib/useSession";
import PatientFrame, { L } from "./PatientFrame";

const TIMES = [
  { t: "08:00", en: "Morning", ur: "صبح" },
  { t: "14:00", en: "Afternoon", ur: "دوپہر" },
  { t: "18:00", en: "Evening", ur: "شام" },
  { t: "21:00", en: "Night", ur: "رات" },
];
const blank = (): MedDraft => ({ name: "", dose: "", times: ["08:00"], with_food: "any", days: null, instructions_en: "", instructions_ur: "", source: "manual" });

function toB64(file: File): Promise<{ b64: string; mime: string }> {
  // Shrink big phone photos so they upload fast on a weak connection.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve({ b64: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function MedicinesView() {
  return <PatientFrame>{(lang) => <Meds lang={lang} />}</PatientFrame>;
}

function Meds({ lang }: { lang: UiLang }) {
  const router = useRouter();
  const { session, ready } = useSession();
  const [today, setToday] = useState<Dose[] | null>(null);
  const [meds, setMeds] = useState<MedT[]>([]);
  const [drafts, setDrafts] = useState<MedDraft[] | null>(null);
  const [unclear, setUnclear] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await cx.meds();
      setToday(r.today);
      setMeds(r.medicines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session || session.account.role !== "patient") router.replace("/login");
    else load();
  }, [ready, session, router, load]);

  async function photo(f: File | undefined) {
    if (!f) return;
    setError(null);
    setBusy("read");
    try {
      const { b64, mime } = await toB64(f);
      const r = await cx.readRx(b64, mime);
      setDrafts(r.medicines.length ? r.medicines : [blank()]);
      setUnclear(r.unclear);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : L(lang, "Couldn't read the photo.", "تصویر نہیں پڑھی جا سکی۔"));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!drafts) return;
    setBusy("save");
    setError(null);
    try {
      await cx.addMeds(drafts.filter((d) => d.name.trim()));
      setDrafts(null);
      setUnclear([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const set = (i: number, patch: Partial<MedDraft>) => setDrafts((d) => d && d.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const food = (f: string) => (f === "before" ? L(lang, "before food", "کھانے سے پہلے") : f === "after" ? L(lang, "after food", "کھانے کے بعد") : "");

  return (
    <>
      <section className="p-card">
        <h1>{L(lang, "My medicines", "میری دوائیں")}</h1>
        <p className="p-muted">
          {L(lang, "Take a photo of your prescription. Sehat Saathi reads it and reminds you on time. It never changes what your doctor wrote.",
            "اپنے نسخے کی تصویر لیں۔ صحت ساتھی اسے پڑھ کر وقت پر یاد دلائے گا۔ یہ ڈاکٹر کی لکھی بات کبھی نہیں بدلتا۔")}
        </p>
        <label className="btn btn-primary p-submit" style={{ display: "grid", placeItems: "center", cursor: "pointer" }}>
          {busy === "read" ? L(lang, "Reading the prescription…", "نسخہ پڑھا جا رہا ہے…") : `📷 ${L(lang, "Photo of prescription", "نسخے کی تصویر")}`}
          <input type="file" accept="image/*" capture="environment" hidden disabled={!!busy} onChange={(e) => photo(e.target.files?.[0])} />
        </label>
        <button type="button" className="btn btn-quiet p-submit" onClick={() => setDrafts((d) => [...(d ?? []), blank()])}>
          ＋ {L(lang, "Add a medicine by hand", "دوا خود لکھیں")}
        </button>
        {push !== "on" && (
          <button type="button" className="btn btn-quiet p-submit" onClick={async () => setPush(await enablePush())}>
            🔔 {L(lang, "Turn on reminders on this phone", "اس فون پر یاد دہانی آن کریں")}
          </button>
        )}
        {push === "on" && <p className="p-ok">✓ {L(lang, "Reminders are on for this phone.", "اس فون پر یاد دہانی آن ہے۔")}</p>}
        {push && push !== "on" && (
          <p className="p-muted small">
            {L(lang, "Notifications are blocked or not supported here. Reminders still show in the app.", "نوٹیفکیشن بند ہیں۔ یاد دہانیاں ایپ میں نظر آئیں گی۔")}
          </p>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      {drafts && (
        <section className="p-card">
          <h2>{L(lang, "Check before saving", "محفوظ کرنے سے پہلے چیک کریں")}</h2>
          <p className="p-muted small">
            {L(lang, "Compare with your prescription. Fix anything that's wrong. Ask your pharmacist if unsure.",
              "اپنے نسخے سے ملائیں۔ جو غلط ہو ٹھیک کریں۔ شک ہو تو فارماسسٹ سے پوچھیں۔")}
          </p>
          {unclear.length > 0 && (
            <p className="p-urgent small" style={{ padding: 10, borderRadius: 10 }}>
              {L(lang, "Couldn't read clearly: ", "واضح نہیں پڑھا جا سکا: ")}
              {unclear.join(", ")}
            </p>
          )}
          {drafts.map((d, i) => (
            <div key={i} className="med-edit">
              <label>{L(lang, "Medicine", "دوا")}</label>
              <input value={d.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Tab. …" dir="ltr" />
              <label>{L(lang, "Dose", "مقدار")}</label>
              <input value={d.dose} onChange={(e) => set(i, { dose: e.target.value })} placeholder={L(lang, "1 tablet", "1 گولی")} dir="auto" />
              <label>{L(lang, "When", "کب")}</label>
              <div className="chips">
                {TIMES.map((x) => (
                  <button
                    key={x.t}
                    type="button"
                    aria-pressed={d.times.includes(x.t)}
                    onClick={() => set(i, { times: d.times.includes(x.t) ? d.times.filter((t) => t !== x.t) : [...d.times, x.t].sort() })}
                  >
                    {L(lang, x.en, x.ur)}
                  </button>
                ))}
              </div>
              <div className="chips">
                {(["before", "after", "any"] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={d.with_food === f} onClick={() => set(i, { with_food: f })}>
                    {f === "any" ? L(lang, "Any time", "کسی بھی وقت") : food(f)}
                  </button>
                ))}
              </div>
              <label>{L(lang, "For how many days (empty = ongoing)", "کتنے دن (خالی = جاری)")}</label>
              <input type="number" min={1} max={365} value={d.days ?? ""} onChange={(e) => set(i, { days: e.target.value ? Number(e.target.value) : null })} />
              {(d.instructions_ur || d.instructions_en) && (
                <p className={`p-muted small${lang === "ur" ? " urdu" : ""}`}>{lang === "ur" ? d.instructions_ur || d.instructions_en : d.instructions_en}</p>
              )}
              <button type="button" className="link-btn small" onClick={() => setDrafts((all) => all && all.filter((_, k) => k !== i))}>
                {L(lang, "Remove", "ہٹائیں")}
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-primary p-submit" disabled={busy === "save" || drafts.every((d) => !d.name.trim() || !d.times.length)} onClick={save}>
            {busy === "save" ? "…" : L(lang, "Save and remind me", "محفوظ کریں اور یاد دلائیں")}
          </button>
        </section>
      )}

      <section className="p-card">
        <h2>{L(lang, "Today", "آج")}</h2>
        {today === null && <p className="p-muted">…</p>}
        {today?.length === 0 && <p className="p-muted">{L(lang, "No medicines yet.", "ابھی کوئی دوا نہیں۔")}</p>}
        <ul className="dose-list">
          {today?.map((d) => (
            <li key={`${d.medicine_id}-${d.time}`} className={`dose ${d.status}`}>
              <span className="dose-time">{fmtTime(d.time, lang)}</span>
              <span className="dose-what">
                <b dir="ltr">{d.name}</b>
                <small>
                  {[d.dose, food(d.with_food)].filter(Boolean).join(" · ")}
                  {d.days_left != null ? ` · ${L(lang, `${d.days_left} days left`, `${d.days_left} دن باقی`)}` : ""}
                </small>
              </span>
              {d.status === "taken" ? (
                <span className="dose-done">✓ {L(lang, "Taken", "لے لی")}</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary dose-btn"
                  onClick={async () => setToday((await cx.taken(d.medicine_id, d.time)).today)}
                >
                  {L(lang, "Taken", "لے لی")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {meds.length > 0 && (
        <section className="p-card">
          <h2>{L(lang, "All my medicines", "میری تمام دوائیں")}</h2>
          <ul className="dose-list">
            {meds.map((m) => (
              <li key={m.id} className="dose">
                <span className="dose-what">
                  <b dir="ltr">{m.name}</b>
                  <small>
                    {m.times.map((t) => fmtTime(t, lang)).join(", ")}
                    {m.days ? ` · ${L(lang, `${m.days} days`, `${m.days} دن`)}` : ""}
                    {m.source === "photo" ? ` · ${L(lang, "from photo", "تصویر سے")}` : ""}
                  </small>
                </span>
                <button type="button" className="link-btn small" onClick={async () => { await cx.stopMed(m.id); load(); }}>
                  {L(lang, "Stop", "بند کریں")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="p-foot">
        <Link href="/patient/home">← {L(lang, "My requests", "میری درخواستیں")}</Link>
      </p>
    </>
  );
}
