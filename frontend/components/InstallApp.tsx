"use client";

import { useEffect, useState } from "react";
import type { UiLang } from "../lib/patientText";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const TEXT = {
  en: {
    title: "Get the Sehat Saathi app",
    body: "Add it to your home screen. No Play Store needed, and it takes no space.",
    install: "Install",
    ios: "On iPhone: tap the Share button, then \"Add to Home Screen\".",
    other: "Open your browser menu (⋮) and choose \"Install app\" or \"Add to Home screen\".",
    hide: "Not now",
  },
  ur: {
    title: "صحت ساتھی ایپ لیں",
    body: "اسے اپنی ہوم اسکرین پر لگائیں۔ پلے اسٹور کی ضرورت نہیں، اور جگہ بھی نہیں لیتی۔",
    install: "انسٹال کریں",
    ios: "آئی فون پر: شیئر کا بٹن دبائیں، پھر ⁨\"Add to Home Screen\"⁩ چنیں۔",
    other: "براؤزر کا مینو ⁨(⋮)⁩ کھولیں اور ⁨\"Install app\"⁩ یا ⁨\"Add to Home screen\"⁩ چنیں۔",
    hide: "ابھی نہیں",
  },
};

let saved: PromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    saved = e as PromptEvent;
  });
}

export default function InstallApp({ lang }: { lang: UiLang }) {
  const t = TEXT[lang];
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let hidden = false;
    try {
      hidden = localStorage.getItem("sehat-install-hidden") === "1";
    } catch {}
    if (installed || hidden) return;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setPrompt(saved);
    setShow(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      saved = e as PromptEvent;
      setPrompt(saved);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  return (
    <section className="p-card p-install">
      <img src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div>
        <b>{t.title}</b>
        <p className="p-muted small">{prompt ? t.body : ios ? t.ios : t.other}</p>
        <div className="p-install-row">
          {prompt && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await prompt.prompt();
                const { outcome } = await prompt.userChoice;
                if (outcome === "accepted") setShow(false);
                saved = null;
                setPrompt(null);
              }}
            >
              {t.install}
            </button>
          )}
          <button
            type="button"
            className="p-link"
            onClick={() => {
              setShow(false);
              try {
                localStorage.setItem("sehat-install-hidden", "1");
              } catch {}
            }}
          >
            {t.hide}
          </button>
        </div>
      </div>
    </section>
  );
}
