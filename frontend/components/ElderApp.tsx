"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "../lib/api";
import { cx, enablePush, type ElderHomeT, type SosT } from "../lib/community";
import { guide } from "../lib/firstAid";
import { loadLang } from "../lib/patientText";
import FirstAidPlayer from "./FirstAidPlayer";

/**
 * The elder's own app: sign in once with phone + 4-digit PIN (set by the family), then one huge
 * HELP button. Pressing it alerts the family and the hospital at once and asks "are you okay?"
 * for 1 minute; no answer and the family is told to check on them.
 */
type Cred = { e: number; t: string; name: string; lang: "ur" | "en" };
const KEY = "ss-elder";

function readCred(): Cred | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    return c && c.e && c.t ? c : null;
  } catch {
    return null;
  }
}
function saveCred(c: Cred | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {}
}

function useSay(ur: boolean) {
  return useCallback(
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
}

export default function ElderApp() {
  const p = useSearchParams();
  const router = useRouter();
  const [cred, setCred] = useState<Cred | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // A family member can send a link that signs this phone in: /elder?e=12&t=…
    const e = Number(p.get("e"));
    const t = p.get("t");
    if (e && t) {
      const c = { e, t, name: "", lang: "ur" as const };
      saveCred(c);
      setCred(c);
      router.replace("/elder");
    } else setCred(readCred());
    setReady(true);
  }, [p, router]);

  if (!ready) return <main className="patient elder"><p className="p-muted">…</p></main>;
  if (!cred)
    return (
      <SignIn
        onDone={(c) => {
          saveCred(c);
          setCred(c);
        }}
      />
    );
  return (
    <Home
      cred={cred}
      onSignOut={() => {
        saveCred(null);
        setCred(null);
      }}
    />
  );
}

// ------------------------------------------------------------------ sign in

function SignIn({ onDone }: { onDone: (c: Cred) => void }) {
  const [ur, setUr] = useState(true);
  useEffect(() => setUr(loadLang() !== "en"), []);
  const W = (en: string, u: string) => (ur ? u : en);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(fullPin: string) {
    setBusy(true);
    setError(null);
    try {
      onDone(await cx.elderLogin(phone, fullPin));
    } catch (x) {
      setError(x instanceof ApiError ? x.message : String(x));
      setPin("");
    } finally {
      setBusy(false);
    }
  }
  function key(d: string) {
    if (busy) return;
    if (d === "⌫") return setPin(pin.slice(0, -1));
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4 && phone.replace(/\D/g, "").length >= 10) go(next);
  }

  return (
    <main className="patient elder" dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
      <button type="button" className="el-lang" onClick={() => setUr(!ur)}>{ur ? "English" : "اردو"}</button>
      <h1 className={ur ? "urdu" : ""}>{W("Elder app sign in", "بزرگوں کی ایپ: سائن اِن")}</h1>
      <p className="p-muted">{W("Your family sets your PIN. Do this once; the phone remembers you.", "آپ کا PIN آپ کے گھر والے بناتے ہیں۔ صرف ایک بار کریں، فون آپ کو یاد رکھے گا۔")}</p>
      <label htmlFor="el-ph" className="el-label">{W("Your phone number", "آپ کا فون نمبر")}</label>
      <input id="el-ph" className="el-phone" inputMode="tel" dir="ltr" autoComplete="tel" value={phone}
             onChange={(e) => setPhone(e.target.value)} placeholder="0300 1234567" />
      <p className="el-label">{W("Your 4-digit PIN", "آپ کا 4 ہندسوں کا PIN")}</p>
      <div className="el-pin" aria-live="polite" aria-label={`${pin.length} of 4`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      <div className="el-keys" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
          d ? (
            <button key={i} type="button" onClick={() => key(d)} disabled={busy} aria-label={d === "⌫" ? "Delete" : d}>{d}</button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {pin.length === 4 && phone.replace(/\D/g, "").length < 10 && (
        <p className="error">{W("Type your full phone number first.", "پہلے پورا فون نمبر لکھیں۔")}</p>
      )}
      {pin.length === 4 && phone.replace(/\D/g, "").length >= 10 && !busy && (
        <button type="button" className="btn btn-primary p-submit" onClick={() => go(pin)}>{W("Sign in", "سائن اِن")}</button>
      )}
      {error && <div className="error">{error}</div>}
      <a className="ck-1122" href="tel:1122">📞 {W("Emergency: call 1122", "ایمرجنسی: 1122 پر کال کریں")}</a>
      <p className="p-muted small">
        {W("No PIN yet? Ask your son, daughter or carer to add you in ", "ابھی PIN نہیں؟ اپنے بیٹے، بیٹی یا دیکھ بھال کرنے والے سے کہیں کہ ")}
        <Link href="/patient/family">{W("Family & guardians", "گھر والے اور سرپرست")}</Link>
        {W(".", " میں آپ کو شامل کریں۔")}
      </p>
    </main>
  );
}

// ------------------------------------------------------------------ home + emergency

const OPEN: SosT["status"][] = ["waiting", "help", "no_response"];

function Home({ cred, onSignOut }: { cred: Cred; onSignOut: () => void }) {
  const [home, setHome] = useState<ElderHomeT | null>(null);
  const [sos, setSos] = useState<SosT | null>(null);
  const [pressing, setPressing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(60);
  const [loc, setLoc] = useState<"asking" | "sent" | "no" | null>(null);
  const [push, setPush] = useState<string | null>(null);
  const [showAid, setShowAid] = useState(false);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const deadline = useRef<number>(0);
  const lastSpoken = useRef<number>(0);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const ur = (home?.lang ?? cred.lang ?? "ur") === "ur";
  const W = (en: string, u: string) => (ur ? u : en);
  const say = useSay(ur);
  const active = pressing || (sos !== null && OPEN.includes(sos.status));

  const load = useCallback(async () => {
    try {
      const h = await cx.elderHome(cred.e, cred.t);
      setHome(h);
      setSos(h.sos);
      setOffline(false);
      if (h.sos?.status === "waiting") deadline.current = Date.now() + h.sos.seconds_left * 1000;
    } catch (x) {
      if (x instanceof ApiError && /not valid/i.test(x.message)) {
        setError(W("This phone was signed out. Please sign in again.", "یہ فون سائن آؤٹ ہو گیا ہے۔ دوبارہ سائن اِن کریں۔"));
        onSignOut();
      } else setOffline(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cred.e, cred.t, onSignOut]);

  useEffect(() => {
    load();
    const id = setInterval(load, active ? 4000 : 30000);
    return () => clearInterval(id);
  }, [load, active]);

  // Countdown, read-aloud prompt every ~10 s, and the 1-minute check when it runs out.
  useEffect(() => {
    if (!(pressing || sos?.status === "waiting")) return;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s > 0 && Date.now() - lastSpoken.current > 10000) {
        lastSpoken.current = Date.now();
        say(W("Are you okay? Press the green button if you are okay. Press the red button if you need an ambulance.",
          "کیا آپ ٹھیک ہیں؟ ٹھیک ہیں تو سبز بٹن دبائیں۔ ایمبولینس چاہیے تو سرخ بٹن دبائیں۔"));
        try { navigator.vibrate?.([400, 200, 400]); } catch {}
      }
      if (s === 0 && sos) {
        cx.sosCheck().catch(() => {}).finally(() => cx.sosState(cred.e, cred.t, sos.id).then(setSos).catch(() => {}));
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressing, sos?.status, sos?.id, say]);

  // Keep the screen on while an alarm is open.
  useEffect(() => {
    if (!active) {
      wake.current?.release().catch(() => {});
      wake.current = null;
      return;
    }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (wake.current = l)).catch(() => {});
  }, [active]);

  async function press() {
    setPressing(true);
    setError(null);
    deadline.current = Date.now() + 60000;
    lastSpoken.current = 0;
    setLeft(60);
    try { navigator.vibrate?.(300); } catch {}
    let ev: SosT;
    try {
      ev = await cx.sos(cred.e, cred.t);
      setSos(ev);
      deadline.current = Date.now() + ev.seconds_left * 1000;
      setOffline(false);
    } catch {
      setOffline(true);
      setPressing(false);
      say(W("No internet. Call 1122 now.", "انٹرنیٹ نہیں ہے۔ ابھی 1122 پر کال کریں۔"));
      return;
    }
    setPressing(false);
    // Location after the alarm is sent, so asking for permission never delays it.
    if ("geolocation" in navigator) {
      setLoc("asking");
      navigator.geolocation.getCurrentPosition(
        (pos) => cx.sosLocation(cred.e, cred.t, ev.id, pos.coords.latitude, pos.coords.longitude)
          .then((s) => { setSos(s); setLoc("sent"); }).catch(() => setLoc("no")),
        () => setLoc("no"),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    } else setLoc("no");
  }

  async function respond(answer: "okay" | "help") {
    if (!sos) return;
    try {
      const s = await cx.sosRespond(cred.e, cred.t, sos.id, answer);
      setSos(s);
      say(answer === "okay"
        ? W("Thank you. Your family has been told you are okay.", "شکریہ۔ آپ کے گھر والوں کو بتا دیا گیا ہے کہ آپ ٹھیک ہیں۔")
        : W("Your family and the hospital know you need an ambulance. Call 1122 now. Sit down and stay still.",
          "آپ کے گھر والوں اور ہسپتال کو بتا دیا گیا ہے۔ ابھی 1122 پر کال کریں۔ بیٹھ جائیں اور ہلیں نہیں۔"));
      if (answer === "help") setShowAid(false);
    } catch (x) {
      setError(x instanceof ApiError ? x.message : W("No internet. Call 1122 now.", "انٹرنیٹ نہیں ہے۔ ابھی 1122 پر کال کریں۔"));
    }
  }

  async function checkin() {
    try {
      await cx.checkin(cred.e, cred.t, "ok");
      say(W("Thank you. Have a good day.", "شکریہ۔ آپ کا دن اچھا گزرے۔"));
      load();
    } catch (x) {
      setError(x instanceof ApiError ? x.message : String(x));
    }
  }

  const name = home?.name || cred.name;
  const call1122 = (
    <a className="el-1122" href="tel:1122">📞 {W("Call 1122 (Rescue)", "1122 (ریسکیو) کو کال کریں")}</a>
  );
  const calls = home?.guardians?.length ? (
    <div className="el-calls">
      {home.guardians.map((g) => (
        <a key={g.phone} className="el-call" href={`tel:${g.phone}`}>
          📞 {g.name}{g.relation ? ` (${g.relation})` : ""}
        </a>
      ))}
    </div>
  ) : null;

  // ---------------- emergency screen
  if (active || (sos?.status === "okay" && sos.id !== dismissed)) {
    const st = pressing ? "waiting" : sos!.status;
    const pct = Math.max(0, Math.min(1, left / 60));
    return (
      <main className={`patient elder el-sos ${st}`} dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
        {st === "waiting" && (
          <>
            <h1 className={ur ? "urdu" : ""}>{W("Help is being called", "مدد بلائی جا رہی ہے")}</h1>
            <div className="el-ring" role="timer" aria-label={`${left} seconds`}>
              <svg viewBox="0 0 120 120" aria-hidden>
                <circle cx="60" cy="60" r="52" className="bg" />
                <circle cx="60" cy="60" r="52" className="fg" style={{ strokeDashoffset: `${326.7 * (1 - pct)}` }} />
              </svg>
              <b>{left}</b>
            </div>
            <p className={`el-q${ur ? " urdu" : ""}`}>{W("Are you okay? Tap a button.", "کیا آپ ٹھیک ہیں؟ ایک بٹن دبائیں۔")}</p>
          </>
        )}
        {st === "no_response" && (
          <div className="el-state bad">
            <h1 className={ur ? "urdu" : ""}>{W("Your family has been told to check on you", "آپ کے گھر والوں کو بتا دیا گیا ہے کہ آپ کو دیکھیں")}</h1>
            <p>{W("You didn't answer for 1 minute. Stay still. If you can, call 1122.", "آپ نے 1 منٹ تک جواب نہیں دیا۔ آرام سے رہیں۔ ہو سکے تو 1122 پر کال کریں۔")}</p>
          </div>
        )}
        {st === "help" && (
          <div className="el-state bad">
            <h1 className={ur ? "urdu" : ""}>{W("Ambulance needed: call 1122 now", "ایمبولینس: ابھی 1122 پر کال کریں")}</h1>
            <p>{W("Your family and the hospital have been told.", "آپ کے گھر والوں اور ہسپتال کو بتا دیا گیا ہے۔")}</p>
          </div>
        )}
        {st === "okay" && (
          <div className="el-state good">
            <h1 className={ur ? "urdu" : ""}>{W("Your family knows you're okay", "آپ کے گھر والوں کو پتہ چل گیا کہ آپ ٹھیک ہیں")}</h1>
            <p>{W("They may still call to check on you.", "وہ پھر بھی خیریت پوچھنے کے لیے فون کر سکتے ہیں۔")}</p>
          </div>
        )}

        {call1122}

        {st !== "okay" && (
          <div className="el-answers">
            {st !== "help" && (
              <button type="button" className="ck-btn help" onClick={() => respond("help")} disabled={pressing}>
                <span aria-hidden>🚑</span>{W("I need an ambulance", "مجھے ایمبولینس چاہیے")}
              </button>
            )}
            <button type="button" className="ck-btn ok" onClick={() => respond("okay")} disabled={pressing}>
              <span aria-hidden>✅</span>{st === "help" ? W("I feel better now", "اب میں بہتر ہوں") : W("I'm okay (pressed by mistake)", "میں ٹھیک ہوں (غلطی سے دبا)")}
            </button>
          </div>
        )}

        <ul className="el-done">
          <li className={sos ? "y" : ""}>{sos ? "✓" : "…"} {W("Family told", "گھر والوں کو اطلاع")}</li>
          <li className={sos?.case_id ? "y" : ""}>{sos?.case_id ? "✓" : "…"} {W("Hospital alerted", "ہسپتال کو اطلاع")}</li>
          <li className={sos?.lat != null ? "y" : ""}>
            {sos?.lat != null ? "✓ " + W("Location shared", "مقام بھیج دیا") : loc === "no" ? "✕ " + W("Location not shared", "مقام نہیں گیا") : "… " + W("Sharing location", "مقام بھیجا جا رہا ہے")}
          </li>
        </ul>

        {st !== "okay" && (
          <section className="el-self">
            <h2 className={ur ? "urdu" : ""}>{W("While you wait", "انتظار کے دوران")}</h2>
            <ul>
              <li>🪑 {W("Sit down, half sitting up, leaning on a wall or pillows.", "بیٹھ جائیں، آدھا ٹیک لگا کر، دیوار یا تکیوں کے سہارے۔")}</li>
              <li>🚶 {W("Don't walk or climb stairs. Stay calm and still.", "چلیں یا سیڑھیاں نہ چڑھیں۔ پرسکون اور آرام سے رہیں۔")}</li>
              <li>👔 {W("Loosen tight clothes at the neck, chest and waist.", "گردن، سینے اور کمر کے تنگ کپڑے ڈھیلے کر دیں۔")}</li>
              <li>💊 {W("Eat nothing. Take medicine only if 1122 or a doctor tells you to.", "کچھ نہ کھائیں۔ دوا صرف تب لیں جب 1122 یا ڈاکٹر کہے۔")}</li>
            </ul>
            <button type="button" className="ck-say" onClick={() => setShowAid(!showAid)}>
              🩺 {W("Someone with you? Show them first aid", "کوئی ساتھ ہے؟ انہیں ابتدائی طبی امداد دکھائیں")}
            </button>
            {showAid && guide("heart") && <FirstAidPlayer guide={guide("heart")!} lang={ur ? "ur" : "en"} />}
          </section>
        )}
        {calls}
        {st === "okay" && (
          <button type="button" className="btn btn-quiet" onClick={() => setDismissed(sos!.id)}>{W("Back to home", "واپس")}</button>
        )}
        {(offline || error) && <div className="error">{error ?? W("No internet. Call 1122 now.", "انٹرنیٹ نہیں ہے۔ ابھی 1122 پر کال کریں۔")}</div>}
      </main>
    );
  }

  // ---------------- home
  const done = home?.status === "ok";
  return (
    <main className="patient elder" dir={ur ? "rtl" : "ltr"} lang={ur ? "ur" : "en"}>
      <h1 className={ur ? "urdu" : ""}>{name ? W(`Assalam-o-Alaikum, ${name}`, `السلام علیکم، ${name}`) : W("Assalam-o-Alaikum", "السلام علیکم")}</h1>
      <button type="button" className="el-help" onClick={press} disabled={pressing}>
        <span className="el-help-ring" aria-hidden />
        <span className="el-help-big">{W("HELP", "مدد")}</span>
        <span className="el-help-sub">{W("Press if you feel unwell", "طبیعت خراب ہو تو دبائیں")}</span>
      </button>
      <p className="p-muted el-help-note">
        {W("Chest pain, can't breathe, fell down, feel faint: press it. Your family and the hospital are told at once.",
          "سینے میں درد، سانس میں تکلیف، گر گئے، چکر آ رہے ہیں: یہ بٹن دبائیں۔ گھر والوں اور ہسپتال کو فوراً پتہ چل جائے گا۔")}
      </p>
      <button type="button" className="ck-say" onClick={() => say(W("Press the big red HELP button if you feel unwell. Your family and the hospital will be told at once.", "طبیعت خراب ہو تو بڑا سرخ مدد کا بٹن دبائیں۔ آپ کے گھر والوں اور ہسپتال کو فوراً بتا دیا جائے گا۔"))}>
        🔊 {W("Listen", "سنیں")}
      </button>

      {home && (done ? (
        <p className="el-okday">💚 {W("Today's check-in done. Thank you!", "آج کی خیریت بتا دی۔ شکریہ!")}</p>
      ) : (
        <button type="button" className="el-okbtn" onClick={checkin}>✅ {W("I'm okay today", "میں آج ٹھیک ہوں")}</button>
      ))}

      {calls}
      {call1122}
      {offline && <div className="error">{W("No internet right now. In an emergency call 1122.", "ابھی انٹرنیٹ نہیں ہے۔ ایمرجنسی میں 1122 پر کال کریں۔")}</div>}
      {error && <div className="error">{error}</div>}

      {push !== "on" ? (
        <button type="button" className="ck-push" onClick={async () => setPush(await enablePush({ elder: cred.e, token: cred.t, lang: ur ? "ur" : "en" }))}>
          🔔 {W("Turn on daily reminder", "روزانہ یاد دہانی آن کریں")}
        </button>
      ) : (
        <p className="p-ok">✓ {W("Daily reminder is on.", "روزانہ یاد دہانی آن ہے۔")}</p>
      )}
      <button
        type="button"
        className="link-btn el-out"
        onClick={() => {
          if (confirm(W("Sign out this phone? You'll need the PIN again.", "اس فون سے سائن آؤٹ کریں؟ دوبارہ PIN چاہیے ہوگا۔"))) onSignOut();
        }}
      >
        {W("Sign out", "سائن آؤٹ")}
      </button>
    </main>
  );
}
