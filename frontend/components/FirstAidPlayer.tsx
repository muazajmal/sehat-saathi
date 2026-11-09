"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AT, REVIEWED_BY, SOURCE, guide as findGuide, type AidGuide } from "../lib/firstAid";
import type { UiLang } from "../lib/patientText";

const STEP_MS = 6500; // when the phone has no voice for this language

function voiceFor(lang: UiLang): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const want = lang === "ur" ? ["ur"] : ["en"];
  return window.speechSynthesis.getVoices().find((v) => want.some((w) => v.lang.toLowerCase().startsWith(w))) ?? null;
}

/**
 * A step-by-step first-aid "video": one big picture and caption per step, read aloud in the
 * patient's language. Works for people who can't hear (captions, pictures), can't see (voice)
 * or can't read (pictures + voice). Plays only when the person presses Play.
 */
export default function FirstAidPlayer({ guide, lang, onOpen }: { guide: AidGuide; lang: UiLang; onOpen?: (key: string) => void }) {
  const t = AT[lang];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useRef(0); // bumps on every stop so stale callbacks do nothing
  const step = guide.steps[i];
  const n = guide.steps.length;

  useEffect(() => {
    const pick = () => setVoice(voiceFor(lang));
    pick();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener?.("voiceschanged", pick);
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", pick);
    }
  }, [lang]);

  const stop = useCallback(() => {
    run.current++;
    if (timer.current) clearTimeout(timer.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
  }, []);

  // A new guide or language starts from the beginning.
  useEffect(() => {
    stop();
    setI(0);
    setFinished(false);
  }, [guide.key, lang, stop]);

  useEffect(() => stop, [stop]);

  const playFrom = useCallback(
    (start: number) => {
      stop();
      const id = ++run.current;
      setPlaying(true);
      setFinished(false);
      const say = (k: number) => {
        if (run.current !== id) return;
        if (k >= n) {
          setPlaying(false);
          setFinished(true);
          return;
        }
        setI(k);
        const text = guide.steps[k][lang];
        const go = () => {
          if (run.current === id) timer.current = setTimeout(() => say(k + 1), 700);
        };
        if (voice) {
          const u = new SpeechSynthesisUtterance(text);
          u.voice = voice;
          u.lang = voice.lang;
          u.rate = 0.92;
          u.onend = go;
          u.onerror = go;
          window.speechSynthesis.speak(u);
        } else {
          timer.current = setTimeout(() => say(k + 1), STEP_MS);
        }
      };
      say(start);
    },
    [guide, lang, n, stop, voice],
  );

  const jump = (k: number) => {
    const to = Math.max(0, Math.min(n - 1, k));
    if (playing) playFrom(to);
    else {
      setI(to);
      setFinished(false);
    }
  };

  const nextGuide = step.next ? findGuide(step.next) : undefined;

  return (
    <div className="fa-player" dir={lang === "ur" ? "rtl" : "ltr"}>
      <div className="fa-screen" aria-live="polite">
        <div className="fa-bar" aria-hidden>
          {guide.steps.map((_, k) => (
            <span key={k} className={k < i ? "done" : k === i ? (playing && !voice ? "now playing" : "now") : ""}>
              {k === i && playing && !voice && <i style={{ animationDuration: `${STEP_MS}ms` }} />}
            </span>
          ))}
        </div>
        <div className={`fa-pic${playing ? " live" : ""}`} key={`${guide.key}-${i}`} aria-hidden>
          {step.icon}
        </div>
        <p className="fa-count">{t.step(i + 1, n)}</p>
        <p className={`fa-caption${lang === "ur" ? " urdu" : ""}`} key={`c-${guide.key}-${i}`}>
          {step[lang]}
        </p>
      </div>

      <div className="fa-controls">
        <button type="button" className="fa-btn" onClick={() => jump(i - 1)} disabled={i === 0} aria-label={t.prev}>
          {lang === "ur" ? "→" : "←"}
        </button>
        <button
          type="button"
          className="fa-btn fa-play"
          onClick={() => (playing ? stop() : playFrom(finished ? 0 : i))}
        >
          {playing ? `❚❚ ${t.pause}` : finished ? `↺ ${t.replay}` : `▶ ${t.play}`}
        </button>
        <button type="button" className="fa-btn" onClick={() => jump(i + 1)} disabled={i === n - 1} aria-label={t.next}>
          {lang === "ur" ? "←" : "→"}
        </button>
      </div>

      {nextGuide && onOpen && (
        <button type="button" className="fa-next" onClick={() => onOpen(nextGuide.key)}>
          🫀 {t.openNext}
        </button>
      )}
      {!voice && <p className="fa-note">{t.noVoice}</p>}
      <p className="fa-note">
        {t.onlyFirstAid}{" "}
        <a href={guide.source_url ?? SOURCE.url} target="_blank" rel="noreferrer">
          {t.basedOn(SOURCE.name)}
        </a>
        {REVIEWED_BY ? ` · ✓ ${t.checkedBy(REVIEWED_BY)}` : ""}
      </p>
    </div>
  );
}
