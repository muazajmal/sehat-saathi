"use client";

import type { UiLang } from "../lib/patientText";
import { ANSWERS, QT, quickIsUrgent, SINCE, SYMPTOMS, WHO, type QuickState } from "../lib/quickText";

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function QuickPick({ lang, value, onChange }: { lang: UiLang; value: QuickState; onChange: (q: QuickState) => void }) {
  const t = QT[lang];
  const set = (patch: Partial<QuickState>) => onChange({ ...value, ...patch });
  const picked = SYMPTOMS.filter((s) => value.symptoms.includes(s.key) && s.asks.length);

  return (
    <div className="qp">
      <fieldset>
        <legend>{t.whoTitle}</legend>
        <div className="qp-chips">
          {WHO.map((w) => (
            <button
              key={w.key}
              type="button"
              className="qp-chip"
              aria-pressed={value.forWhom === w.key}
              onClick={() => set({ forWhom: value.forWhom === w.key ? null : w.key, ageUnit: w.key === "child" ? value.ageUnit : "years" })}
            >
              {w.label[lang]}
            </button>
          ))}
        </div>
        <div className="qp-age">
          <label htmlFor="qp-age">
            {t.age} <span className="p-muted small">{t.optional}</span>
          </label>
          <input
            id="qp-age"
            inputMode="numeric"
            dir="ltr"
            value={value.age}
            onChange={(e) => set({ age: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            placeholder={value.ageUnit === "months" ? "8" : "35"}
          />
          {value.forWhom === "child" ? (
            <div className="qp-chips tight" role="group" aria-label={t.age}>
              {(["years", "months"] as const).map((u) => (
                <button key={u} type="button" className="qp-chip" aria-pressed={value.ageUnit === u} onClick={() => set({ ageUnit: u })}>
                  {t[u]}
                </button>
              ))}
            </div>
          ) : (
            <span className="p-muted">{t.years}</span>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t.whatTitle}</legend>
        <div className="qp-tiles">
          {SYMPTOMS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`qp-tile${s.urgent ? " danger" : ""}`}
              aria-pressed={value.symptoms.includes(s.key)}
              onClick={() => set({ symptoms: toggle(value.symptoms, s.key) })}
            >
              <span className="qp-icon" aria-hidden>
                {s.icon}
              </span>
              <span>{s.label[lang]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {picked.map((s) => (
        <fieldset key={s.key} className="qp-follow">
          <legend>
            {s.icon} {s.label[lang]}
          </legend>
          <div className="qp-chips">
            {s.asks.map((a) => (
              <button
                key={a}
                type="button"
                className={`qp-chip${ANSWERS[a].urgent ? " danger" : ""}`}
                aria-pressed={value.answers.includes(a)}
                onClick={() => set({ answers: toggle(value.answers, a) })}
              >
                {ANSWERS[a].label[lang]}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      {value.symptoms.length > 0 && (
        <fieldset>
          <legend>{t.sinceTitle}</legend>
          <div className="qp-chips">
            {SINCE.map((x) => (
              <button
                key={x.key}
                type="button"
                className="qp-chip"
                aria-pressed={value.since === x.key}
                onClick={() => set({ since: value.since === x.key ? null : x.key })}
              >
                {x.label[lang]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {quickIsUrgent(value) && (
        <div className="qp-alert" role="alert">
          <span>{t.urgentNow}</span>
          <a className="p-sos-btn" href="tel:1122">
            1122
          </a>
        </div>
      )}
    </div>
  );
}
