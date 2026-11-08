"use client";

import { useEffect, useState } from "react";

// Patient language code -> voice language to look for. Only offered when the phone has a matching voice.
const VOICE_LANG: Record<string, string[]> = {
  ur: ["ur"],
  pa: ["pa", "ur"],
  skr: ["ur"],
  en: ["en"],
  roman_ur: ["en"],
  ar: ["ar"],
  fa: ["fa"],
  ps: ["ps"],
  sd: ["sd"],
};

function pickVoice(language: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const want = VOICE_LANG[language] ?? [language];
  const voices = window.speechSynthesis.getVoices();
  for (const code of want) {
    const v = voices.find((x) => x.lang.toLowerCase().replace("_", "-").startsWith(code));
    if (v) return v;
  }
  return null;
}

export default function ReadAloud({ text, language, label, stopLabel }: { text: string; language: string; label: string; stopLabel: string }) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const find = () => setVoice(pickVoice(language));
    find();
    window.speechSynthesis.addEventListener?.("voiceschanged", find);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", find);
      window.speechSynthesis.cancel();
    };
  }, [language]);

  if (!voice || !text) return null;

  function speak() {
    const s = window.speechSynthesis;
    if (speaking) {
      s.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice!.lang;
    u.rate = 0.9;
    u.onend = u.onerror = () => setSpeaking(false);
    s.cancel();
    s.speak(u);
    setSpeaking(true);
  }

  return (
    <button type="button" className="btn btn-quiet p-speak" onClick={speak} aria-pressed={speaking}>
      <span aria-hidden>{speaking ? "■" : "🔊"}</span> {speaking ? stopLabel : label}
    </button>
  );
}
