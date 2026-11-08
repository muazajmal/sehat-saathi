"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Floating red button that opens an emergency pop-up. Shown in both English
// and Urdu at once: in an emergency nobody should have to find a language switch.
const SIGNS: [string, string][] = [
  ["Chest pain or pressure", "سینے میں درد یا دباؤ"],
  ["Trouble breathing", "سانس لینے میں تکلیف"],
  ["Fainting or not waking up", "بے ہوشی یا ہوش نہ آنا"],
  ["Heavy bleeding", "بہت زیادہ خون بہنا"],
  ["Face drooping, weak arm, slurred speech", "چہرہ ٹیڑھا، بازو کمزور، زبان لڑکھڑانا"],
  ["Fits (seizure), severe burn or poisoning", "دورہ، شدید جلنا یا زہر"],
  ["Pregnancy with bleeding or severe pain", "حمل میں خون یا شدید درد"],
];

export default function EmergencyButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button className="sos-fab" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="sos-fab-ring" aria-hidden />
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M12 3 2 20h20L12 3Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M12 9.5v5M12 17.2v.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span>Emergency</span>
        <span className="sos-fab-ur" lang="ur">ایمرجنسی</span>
      </button>

      <dialog
        ref={ref}
        className="sos-dialog"
        aria-labelledby="sos-title"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false); // tap outside closes
        }}
      >
        <div className="sos-inner">
          <button className="sos-close" type="button" onClick={() => setOpen(false)} aria-label="Close">
            ×
          </button>
          <p className="sos-kicker">Medical emergency?</p>
          <h2 id="sos-title">
            Call Rescue 1122 now
            <span lang="ur" dir="rtl">ابھی ریسکیو 1122 پر کال کریں</span>
          </h2>

          <a className="sos-call" href="tel:1122">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <path
                d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"
                fill="currentColor"
              />
            </svg>
            Call 1122 <span lang="ur">کال کریں</span>
          </a>
          <a className="sos-alt" href="tel:115">
            No answer? Edhi ambulance <b>115</b>
          </a>

          <p className="sos-label">
            Call 1122 if you see any of these
            <span lang="ur" dir="rtl">ان میں سے کچھ بھی ہو تو 1122 پر کال کریں</span>
          </p>
          <ul className="sos-signs">
            {SIGNS.map(([en, ur]) => (
              <li key={en}>
                <span>{en}</span>
                <span lang="ur" dir="rtl">{ur}</span>
              </li>
            ))}
          </ul>

          <p className="sos-wait">
            While you wait: stay with the person, keep them still, and give nothing to eat or drink if they are drowsy.
            <span lang="ur" dir="rtl">انتظار میں: مریض کے ساتھ رہیں، اسے ہلائیں نہیں، اور غنودگی ہو تو کچھ کھانے پینے کو نہ دیں۔</span>
          </p>

          <Link className="sos-help" href="/patient" onClick={() => setOpen(false)}>
            Not sure it&apos;s an emergency? Tell a doctor what&apos;s wrong →
            <span lang="ur" dir="rtl">یقین نہیں؟ ڈاکٹر کو اپنی تکلیف بتائیں</span>
          </Link>
        </div>
      </dialog>
    </>
  );
}
