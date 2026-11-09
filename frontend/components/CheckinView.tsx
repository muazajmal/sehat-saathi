"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../lib/api";
import { cx, enablePush } from "../lib/community";

/** The elder's page: two huge buttons, read aloud, works on any phone. */
export default function CheckinView() {
  const p = useSearchParams();
  const e = Number(p.get("e"));
  const t = p.get("t") ?? "";
  const [info, setInfo] = useState<Awaited<ReturnType<typeof cx.checkinInfo>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<string | null>(null);
  const ur = (info?.lang ?? "ur") === "ur";
  const W = (en: string, u: string) => (ur ? u : en);

  useEffect(() => {
    if (!e || !t) return setError("This link is incomplete.");
    cx.checkinInfo(e, t).then(setInfo).catch((x) => setError(x instanceof ApiError ? x.message : "Couldn't open."));
  }, [e, t]);

  const say = useCallback(
    (text: string) => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(ur ? "ur" : "en"));
        if (v) u.voice = v;
        u.lang = v?.lang ?? (ur ? "ur-PK" : "en-GB");
        u.rate = 0.9;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch {}
    },
    [ur],
  );

  async function answer(status: "ok" | "help") {
    setBusy(true);
    try {
      setInfo(await cx.checkin(e, t, status));
      say(status === "ok" ? W("Thank you. Have a good day.", "شکریہ۔ آپ کا دن اچھا گزرے۔") : W("Your family has been told. Help is coming.", "آپ کے گھر والوں کو بتا دیا گیا ہے۔"));
    } catch (x) {
      setError(x instanceof ApiError ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="patient checkin"><div className="error">{error}</div></main>;
  if (!info) return <main className="patient checkin"><p className="p-muted">…</p></main>;
  const done = info.status === "ok" || info.status === "help";

  return (
    <main className="patient checkin" dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
      <h1 className={ur ? "urdu" : ""}>{W(`Assalam-o-Alaikum, ${info.name}`, `السلام علیکم، ${info.name}`)}</h1>
      {!done ? (
        <>
          <p className={`ck-q${ur ? " urdu" : ""}`}>{W("Are you okay today?", "کیا آپ آج ٹھیک ہیں؟")}</p>
          <button type="button" className="ck-say" onClick={() => say(W("Are you okay today? Press the green button if you are okay. Press the red button if you need help.", "کیا آپ آج ٹھیک ہیں؟ ٹھیک ہیں تو سبز بٹن دبائیں۔ مدد چاہیے تو سرخ بٹن دبائیں۔"))}>
            🔊 {W("Listen", "سنیں")}
          </button>
          <button type="button" className="ck-btn ok" disabled={busy} onClick={() => answer("ok")}>
            <span aria-hidden>✅</span>
            {W("I'm okay", "میں ٹھیک ہوں")}
          </button>
          <button type="button" className="ck-btn help" disabled={busy} onClick={() => answer("help")}>
            <span aria-hidden>🆘</span>
            {W("I need help", "مجھے مدد چاہیے")}
          </button>
        </>
      ) : (
        <div className={`ck-done ${info.status}`}>
          <span aria-hidden>{info.status === "ok" ? "💚" : "🚑"}</span>
          <p className={ur ? "urdu" : ""}>
            {info.status === "ok" ? W("Thank you! Your family knows you're okay.", "شکریہ! آپ کے گھر والوں کو پتہ چل گیا کہ آپ ٹھیک ہیں۔")
              : W("Your family has been told. If it's serious, call 1122.", "آپ کے گھر والوں کو بتا دیا گیا ہے۔ اگر حالت خراب ہو تو 1122 پر کال کریں۔")}
          </p>
        </div>
      )}
      <a className="ck-1122" href="tel:1122">📞 {W("Emergency: call 1122", "ایمرجنسی: 1122 پر کال کریں")}</a>
      {push !== "on" ? (
        <button type="button" className="ck-push" onClick={async () => setPush(await enablePush({ elder: e, token: t, lang: ur ? "ur" : "en" }))}>
          🔔 {W("Turn on daily reminder", "روزانہ یاد دہانی آن کریں")}
        </button>
      ) : (
        <p className="p-ok">✓ {W("Daily reminder is on.", "روزانہ یاد دہانی آن ہے۔")}</p>
      )}
    </main>
  );
}
