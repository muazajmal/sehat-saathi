"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiCall, ApiError } from "../lib/api";
import { T } from "../lib/patientText";
import ReadAloud from "./ReadAloud";
import { EmergencyBar, PatientHeader, useClinicName, usePatientLang } from "./PatientPortal";

/** Report Samjhao: Mystery Card 5, the AI Summary Button.
 *  1 pick long content · 2 choose summary style · 3 generate summary · 4 keep original meaning. */

type Point = { en: string; ur: string; src: number[]; h_en?: string; h_ur?: string };
type Summary = {
  one_line: Point;
  bullets: Point[];
  detailed: Point[];
  urgency: "routine" | "soon" | "urgent";
  urgency_reason_en: string;
  urgency_reason_ur: string;
  specialty: string;
  lines: string[];
  engine: string;
};
type Style = "one" | "bullets" | "detailed";
type Check = { level: "ok" | "warn" | "bad"; src: number[]; count: number; missing: number[] };

const TX = {
  en: {
    title: "Report Samjhao: understand your report",
    sub: "Paste a long lab report or take a photo. Pick a style and get a short, clear summary that keeps every number exactly as the report says.",
    s1: "1. Your report",
    example: "Use example report",
    photo: "Read a photo",
    reading: "Reading photo…",
    paste: "Paste the report text here…",
    s2: "2. Summary style",
    one: "One line",
    bullets: "3 bullets",
    detailed: "Detailed",
    lang: "Language",
    s3: "Summarize",
    working: "Summarizing…",
    result: "Your summary",
    tapHint: "Tap a point to see the report lines it comes from.",
    lines: "Report lines",
    kept: "Meaning kept",
    check: "Check before sharing",
    changed: "Meaning changed",
    numbers: (n: number) => `${n} numbers checked against the report`,
    allFound: "all found.",
    notFound: (x: string) => `not found: ${x}.`,
    linked: (a: number, b: number) => `${a} of ${b} points are linked to report lines.`,
    noNew: "Units and ranges are kept as written. No new medical claims are added.",
    notIn: "Not in report",
    urg: { routine: "Routine", soon: "See a doctor soon", urgent: "Urgent: today" },
    book: (s: string) => `Ask for a ${s} appointment`,
    listen: "Listen",
    stop: "Stop",
    engine: { live: "Live AI (Gemini)", example: "Example result", rules: "AI off: results copied word for word" },
    short: "Paste a longer report first. A few lines of results are enough.",
    foot: "Summaries explain the report. They are not a diagnosis. A doctor decides your treatment.",
  },
  ur: {
    title: "رپورٹ سمجھاؤ: اپنی رپورٹ سمجھیں",
    sub: "لمبی لیب رپورٹ یہاں لکھیں یا تصویر لیں۔ انداز چنیں اور مختصر، واضح خلاصہ پائیں جس میں ہر نمبر رپورٹ جیسا ہی رہے۔",
    s1: "1. آپ کی رپورٹ",
    example: "مثال کی رپورٹ",
    photo: "تصویر سے پڑھیں",
    reading: "تصویر پڑھی جا رہی ہے…",
    paste: "رپورٹ کا متن یہاں لکھیں…",
    s2: "2. خلاصے کا انداز",
    one: "ایک لائن",
    bullets: "3 نکات",
    detailed: "تفصیلی",
    lang: "زبان",
    s3: "خلاصہ بنائیں",
    working: "خلاصہ بن رہا ہے…",
    result: "آپ کا خلاصہ",
    tapHint: "کسی نکتے پر ٹیپ کریں تو رپورٹ کی وہ لائنیں نظر آئیں گی جہاں سے یہ لیا گیا۔",
    lines: "رپورٹ کی لائنیں",
    kept: "مطلب برقرار ہے",
    check: "شیئر کرنے سے پہلے دیکھ لیں",
    changed: "مطلب بدل گیا",
    numbers: (n: number) => `${n} نمبر رپورٹ سے ملائے گئے`,
    allFound: "سب موجود ہیں۔",
    notFound: (x: string) => `یہ نہیں ملے: ${x}۔`,
    linked: (a: number, b: number) => `${b} میں سے ${a} نکات رپورٹ کی لائنوں سے جڑے ہیں۔`,
    noNew: "اکائیاں اور حدیں رپورٹ جیسی ہیں۔ کوئی نئی طبی بات شامل نہیں کی گئی۔",
    notIn: "رپورٹ میں نہیں",
    urg: { routine: "معمول", soon: "جلد ڈاکٹر کو دکھائیں", urgent: "فوری: آج ہی" },
    book: (s: string) => `${s} کے لیے وقت مانگیں`,
    listen: "سنیں",
    stop: "روکیں",
    engine: { live: "لائیو AI (Gemini)", example: "مثال کا نتیجہ", rules: "AI بند: نتائج ہوبہو نقل" },
    short: "پہلے لمبی رپورٹ لکھیں۔ نتائج کی چند لائنیں کافی ہیں۔",
    foot: "خلاصہ رپورٹ سمجھاتا ہے، یہ تشخیص نہیں۔ علاج کا فیصلہ ڈاکٹر کرتا ہے۔",
  },
};

const DIGITS: Record<string, string> = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9" };
const nums = (t: string) =>
  (String(t).replace(/[۰-۹]/g, (d) => DIGITS[d] ?? d).match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const splitLines = (t: string) => t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 150);

/** Meaning guard, re-run on the report as it is NOW, so editing the report after summarising is caught. */
function check(p: Point, lines: string[]): Check {
  const src = (p.src ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= lines.length);
  const all = new Set(lines.flatMap(nums));
  const ns = Array.from(new Set(nums(`${p.en} ${p.ur} ${p.h_en ?? ""}`)));
  const missing = ns.filter((n) => !all.has(n));
  return { level: missing.length ? "bad" : src.length ? "ok" : "warn", src, count: ns.length, missing };
}

function toBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export default function ReportSamjhao() {
  const [lang, setLang] = usePatientLang();
  const clinic = useClinicName();
  const t = TX[lang];
  const [text, setText] = useState("");
  const [style, setStyle] = useState<Style>("bullets");
  const [sum, setSum] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"" | "sum" | "photo">("");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(-1);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const linesRef = useRef<HTMLOListElement>(null);

  const lines = useMemo(() => splitLines(text), [text]);
  const points: Point[] = !sum ? [] : style === "one" ? [sum.one_line] : style === "bullets" ? sum.bullets.slice(0, 3) : sum.detailed;
  const checks = points.map((p) => check(p, lines));
  const every = sum ? [sum.one_line, ...sum.bullets, ...sum.detailed].map((p) => check(p, lines)) : [];
  const missing = Array.from(new Set(every.flatMap((c) => c.missing)));
  const unlinked = every.filter((c) => !c.src.length).length;
  const level = missing.length ? "bad" : unlinked ? "warn" : "ok";
  const hl = sel >= 0 && checks[sel] ? checks[sel].src : [];
  const speakText = points.map((p) => (lang === "ur" ? `${p.h_ur ?? ""} ${p.ur}` : `${p.h_en ?? ""} ${p.en}`)).join(". ");

  async function example() {
    setErr("");
    try {
      const r = await apiCall<{ text: string }>("/api/summarize/example");
      setText(r.text);
      setSum(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    }
  }

  async function photo(f: File | undefined) {
    if (!f) return;
    setErr("");
    setBusy("photo");
    try {
      const r = await apiCall<{ text: string }>("/api/summarize/read-photo", {
        method: "POST",
        body: JSON.stringify({ image_b64: await toBase64(f), mime: f.type || "image/jpeg" }),
      });
      setText(r.text);
      setSum(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function summarize() {
    if (text.trim().length < 40) {
      setErr(t.short);
      return;
    }
    setErr("");
    setBusy("sum");
    setSel(-1);
    try {
      const r = await apiCall<Summary>("/api/summarize", { method: "POST", body: JSON.stringify({ text }) });
      setSum(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  function pick(i: number) {
    setSel(i);
    setTimeout(() => linesRef.current?.querySelector(".hl")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  const engine = sum ? (sum.engine === "example" ? t.engine.example : sum.engine === "rules" ? t.engine.rules : t.engine.live) : "";

  return (
    <main className="patient" dir={T[lang].dir} lang={lang}>
      <PatientHeader lang={lang} onLang={setLang} clinic={clinic} />
      <EmergencyBar lang={lang} />

      <section className="p-card">
        <h1>📄 {t.title}</h1>
        <p className="p-muted">{t.sub}</p>

        <h2>{t.s1}</h2>
        <div className="rs-tools">
          <button type="button" className="qp-chip" onClick={example}>
            {t.example}
          </button>
          <button type="button" className="qp-chip" onClick={() => fileRef.current?.click()} disabled={busy === "photo"}>
            📷 {busy === "photo" ? t.reading : t.photo}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => photo(e.target.files?.[0])} />
        </div>
        <textarea
          className="rs-text"
          dir="ltr"
          rows={9}
          value={text}
          placeholder={t.paste}
          onChange={(e) => setText(e.target.value)}
          aria-label={t.s1}
        />

        <h2>{t.s2}</h2>
        <div className="qp-chips" role="group" aria-label={t.s2}>
          {(["one", "bullets", "detailed"] as Style[]).map((s) => (
            <button key={s} type="button" className="qp-chip" aria-pressed={style === s} onClick={() => { setStyle(s); setSel(-1); }}>
              {t[s]}
            </button>
          ))}
        </div>
        <div className="qp-chips rs-lang" role="group" aria-label={t.lang}>
          <span className="p-muted">{t.lang}:</span>
          <button type="button" className="qp-chip" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
            English
          </button>
          <button type="button" className="qp-chip" aria-pressed={lang === "ur"} onClick={() => setLang("ur")}>
            اردو
          </button>
        </div>

        <button type="button" className="btn btn-primary p-submit rs-go" onClick={summarize} disabled={busy === "sum"}>
          ✨ {busy === "sum" ? t.working : t.s3}
        </button>
        {err && <p className="voice-err" role="alert">{err}</p>}
      </section>

      {sum && (
        <section className="p-card" ref={resultRef}>
          <div className="rs-head">
            <h2>{t.result}</h2>
            <span className="rs-engine">{engine}</span>
          </div>
          <p className="p-muted small">{t.tapHint}</p>

          <div className={`rs-points ${style}`}>
            {points.map((p, i) => {
              const c = checks[i];
              return (
                <button key={`${style}-${i}`} type="button" className={`rs-pt${sel === i ? " sel" : ""}`} onClick={() => pick(i)}>
                  <span className={`rs-mark ${c.level}`} aria-label={c.level}>
                    {c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✕"}
                  </span>
                  <span className="rs-body">
                    {style === "detailed" && <b className="rs-h">{lang === "ur" ? p.h_ur : p.h_en}</b>}
                    <span className={lang === "ur" ? "urdu" : ""}>{lang === "ur" ? p.ur || p.en : p.en}</span>
                    <span className="rs-src">
                      {c.src.map((n) => (
                        <span key={n}>L{n}</span>
                      ))}
                    </span>
                    {c.missing.length > 0 && (
                      <span className="rs-flag">
                        {t.notIn}: {c.missing.join(", ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <ReadAloud text={speakText} language={lang} label={`🔊 ${t.listen}`} stopLabel={t.stop} />

          <div className={`rs-guard ${level}`} role="status">
            <b>🛡️ {level === "ok" ? t.kept : level === "warn" ? t.check : t.changed}</b>
            <ul>
              <li>
                {t.numbers(every.reduce((a, c) => a + c.count, 0))}: {missing.length ? t.notFound(missing.join(", ")) : t.allFound}
              </li>
              <li>{t.linked(every.length - unlinked, every.length)}</li>
              <li>{t.noNew}</li>
            </ul>
          </div>

          <div className="rs-urg">
            <span className={`rs-chip ${sum.urgency}`}>{t.urg[sum.urgency]}</span>
            <span className={lang === "ur" ? "urdu" : ""}>{lang === "ur" ? sum.urgency_reason_ur : sum.urgency_reason_en}</span>
          </div>
          <Link className="btn btn-primary p-submit" href={`/patient?m=${encodeURIComponent(`Lab report: ${sum.one_line.en}`)}`}>
            {t.book(sum.specialty)}
          </Link>

          <h2 className="rs-lines-h">{t.lines}</h2>
          <ol className="rs-lines" ref={linesRef} dir="ltr">
            {lines.map((l, i) => (
              <li key={i} className={hl.includes(i + 1) ? "hl" : ""}>
                <span className="rs-ln">{i + 1}</span>
                <span>{l}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="p-foot">{t.foot}</p>
    </main>
  );
}
