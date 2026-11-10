"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../lib/api";
import { cx, type WatchT } from "../lib/community";
import { loadLang, saveLang } from "../lib/patientText";
import SosBanner from "./SosBanner";

/** A guardian's private live page (link from the alert email). No login needed. */
export default function GuardianWatch() {
  const g = useSearchParams().get("g") ?? "";
  const [w, setW] = useState<WatchT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "ur">("ur");
  useEffect(() => setLang(loadLang()), []);
  const L = (en: string, ur: string) => (lang === "ur" ? ur : en);

  const load = useCallback(
    () => cx.watch(g).then((x) => { setW(x); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.message : String(e))),
    [g],
  );
  const open = !!w?.sos && ["waiting", "no_response", "help"].includes(w.sos.status);
  useEffect(() => {
    if (!g) return setError("This link is incomplete.");
    load();
    const id = setInterval(load, open ? 4000 : 20000);
    return () => clearInterval(id);
  }, [g, load, open]);

  const CHECK: Record<string, [string, string]> = {
    ok: ["✅ Checked in okay today", "✅ آج خیریت بتا دی"],
    help: ["🆘 Asked for help on today's check-in", "🆘 آج مدد مانگی"],
    upcoming: ["🕘 Daily check-in later today", "🕘 آج کی خیریت بعد میں"],
    waiting: ["⏳ Waiting for today's check-in", "⏳ آج کی خیریت کا انتظار"],
    missed: ["⚠️ Hasn't checked in today: please call", "⚠️ آج خیریت نہیں بتائی: فون کریں"],
  };

  return (
    <main className="patient guardian" dir={lang === "ur" ? "rtl" : "ltr"} lang={lang}>
      <button type="button" className="el-lang" onClick={() => { const l = lang === "ur" ? "en" : "ur"; setLang(l); saveLang(l); }}>
        {lang === "ur" ? "English" : "اردو"}
      </button>
      {error && <div className="error">{error}</div>}
      {w && (
        <>
          <section className="p-card">
            <p className="p-muted">{L(`Hello ${w.me}. You are a guardian for`, `السلام علیکم ${w.me}۔ آپ سرپرست ہیں`)}</p>
            <h1>{w.name}</h1>
            {w.card && <p className="p-muted small">{w.card}</p>}
            {w.sos ? (
              <SosBanner name={w.name} phone={w.phone} sos={w.sos} lang={lang}
                         onHandled={async () => setW(await cx.watchHandled(g, w.sos!.id))} />
            ) : (
              <p className="sos-calm">💚 {L("No emergency right now.", "ابھی کوئی ایمرجنسی نہیں۔")}</p>
            )}
            <p className="p-muted">{L(...CHECK[w.checkin])}</p>
            {w.phone && <a className="btn btn-quiet" href={`tel:${w.phone}`}>📞 {L(`Call ${w.name}`, `${w.name} کو کال کریں`)}</a>}
          </section>
          <p className="p-muted small">
            {L("This page updates by itself. Keep it open, or open the link from your email when an alert comes.",
              "یہ صفحہ خود اپ ڈیٹ ہوتا ہے۔ کھلا رکھیں، یا الرٹ آنے پر ای میل والا لنک کھولیں۔")}
          </p>
        </>
      )}
    </main>
  );
}
