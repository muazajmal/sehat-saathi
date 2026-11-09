"use client";

import { useEffect, useState } from "react";
import { AT, guide } from "../lib/firstAid";
import type { UiLang } from "../lib/patientText";
import FirstAidPlayer from "./FirstAidPlayer";

/** Pops up beside the patient's status while help is on the way: a side panel on wide screens,
 * a bottom sheet on phones. It can be hidden to a small button and opened again. */
export default function FirstAidSheet({ keys, lang, etaMin }: { keys: string[]; lang: UiLang; etaMin?: number | null }) {
  const t = AT[lang];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(keys[0]);
  const [extra, setExtra] = useState<string[]>([]);

  // Open on its own a moment after the page loads, so the 1122 button is seen first.
  useEffect(() => {
    const id = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!keys.includes(active) && !extra.includes(active)) setActive(keys[0]);
  }, [keys, active, extra]);

  const tabs = [...keys, ...extra.filter((k) => !keys.includes(k))];
  const g = guide(active);
  if (!g) return null;

  if (!open)
    return (
      <button type="button" className="fa-pill" onClick={() => setOpen(true)} dir={lang === "ur" ? "rtl" : "ltr"}>
        🩺 {t.show}
      </button>
    );

  return (
    <aside className="fa-sheet" role="dialog" aria-label={t.whatToDo} dir={lang === "ur" ? "rtl" : "ltr"}>
      <header className="fa-head">
        <div>
          <b>{t.whatToDo}</b>
          {etaMin ? <small>{t.helpIn(Math.max(1, etaMin))}</small> : null}
        </div>
        <button type="button" className="fa-hide" onClick={() => setOpen(false)}>
          {t.hide}
        </button>
      </header>
      <a className="fa-call" href="tel:1122">
        📞 1122
      </a>
      {tabs.length > 1 && (
        <div className="fa-tabs" role="tablist">
          {tabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === active} onClick={() => setActive(k)}>
              {guide(k)?.title[lang]}
            </button>
          ))}
        </div>
      )}
      <h3 className="fa-title">{g.title[lang]}</h3>
      <FirstAidPlayer
        guide={g}
        lang={lang}
        onOpen={(k) => {
          if (!tabs.includes(k)) setExtra((e) => [...e, k]);
          setActive(k);
        }}
      />
    </aside>
  );
}
