"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { UiLang } from "../lib/patientText";

const MAX_SECONDS = 60;
const RATE = 16000;

const TEXT = {
  en: {
    speak: "Speak instead",
    hint: "Tap, then say what's wrong in any language",
    stop: "Stop",
    listening: (s: number) => `Listening… ${s}s`,
    working: "Writing down what you said…",
    done: "Check the words in the box, fix anything, then press Get help.",
    blocked: "The microphone is blocked. Allow it for this site in your browser, or type instead.",
    unsupported: "This browser can't record. Please type instead.",
    empty: "We couldn't hear any words. Try again closer to the phone.",
  },
  ur: {
    speak: "بول کر بتائیں",
    hint: "ٹیپ کریں، پھر کسی بھی زبان میں اپنی تکلیف بولیں",
    stop: "روکیں",
    listening: (s: number) => `سن رہے ہیں… ${s} سیکنڈ`,
    working: "آپ کی بات لکھی جا رہی ہے…",
    done: "خانے میں لکھی بات دیکھ لیں، غلطی ٹھیک کریں، پھر \"مدد حاصل کریں\" دبائیں۔",
    blocked: "مائیکروفون کی اجازت نہیں ہے۔ براؤزر میں اجازت دیں یا لکھ کر بتائیں۔",
    unsupported: "یہ براؤزر ریکارڈ نہیں کر سکتا۔ لکھ کر بتائیں۔",
    empty: "کوئی آواز سنائی نہیں دی۔ فون کے قریب ہو کر دوبارہ بولیں۔",
  },
};

// Any browser recording (webm, mp4, ogg) -> 16 kHz mono WAV, which Gemini reads reliably.
async function toWavBase64(blob: Blob): Promise<string> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close().catch(() => {});
  const length = Math.ceil(decoded.duration * RATE);
  const off = new OfflineAudioContext(1, Math.max(1, length), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);

  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export default function VoiceButton({ lang, onText }: { lang: UiLang; onText: (text: string) => void }) {
  const t = TEXT[lang];
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  async function start() {
    setNote(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNote({ ok: false, text: t.unsupported });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setNote({ ok: false, text: t.blocked });
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    rec.current = r;
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) clearInterval(timer.current);
      setState("working");
      try {
        const audio = await toWavBase64(new Blob(chunks, { type: r.mimeType }));
        const { text } = await api.transcribe(audio, lang);
        if (text.trim()) {
          onText(text.trim());
          setNote({ ok: true, text: t.done });
        } else setNote({ ok: false, text: t.empty });
      } catch (e) {
        setNote({ ok: false, text: e instanceof ApiError ? e.message : t.empty });
      } finally {
        setState("idle");
      }
    };
    r.start();
    setSeconds(0);
    setState("recording");
    const began = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) r.state === "recording" && r.stop();
    }, 250);
  }

  return (
    <div className="voice">
      {state === "recording" ? (
        <button type="button" className="voice-btn on" onClick={() => rec.current?.stop()}>
          <span className="voice-dot" aria-hidden /> {t.stop} · {t.listening(seconds)}
        </button>
      ) : (
        <button type="button" className="voice-btn" onClick={start} disabled={state === "working"}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {state === "working" ? t.working : t.speak}
        </button>
      )}
      {state === "idle" && !note && <p className="p-muted small">{t.hint}</p>}
      {note && <p className={note.ok ? "p-ok small" : "voice-err small"}>{note.text}</p>}
    </div>
  );
}
