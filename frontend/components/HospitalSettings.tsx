"use client";

import { useEffect, useState } from "react";
import { apiCall, ApiError } from "../lib/api";
import AppShell, { useStaff } from "./AppShell";

interface Hospital {
  id: number; slug: string; name: string; city: string; address: string; phone: string; email: string; hours: string;
  visit_fee_pkr: number; emergency_24h: boolean; standard_fee_pkr: number; fee_in_use_pkr: number; patient_link: string;
}

/** Hospital admin: the hospital's own name, contact details, opening hours and visit fee, as patients see them. */
export default function HospitalSettings() {
  const [staff, setStaff] = useStaff();
  const [h, setH] = useState<Hospital | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiCall<Hospital>("/api/admin/hospital").then(setH).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!h) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { name, city, address, phone, email, hours, visit_fee_pkr, emergency_24h } = h;
      const saved = await apiCall<Hospital>("/api/admin/hospital", {
        method: "PUT",
        body: JSON.stringify({ name, city, address, phone, email, hours, visit_fee_pkr: Number(visit_fee_pkr) || 0, emergency_24h }),
      });
      setH(saved);
      setNote("Saved. Patients see the new details straight away.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof Hospital>(k: K, v: Hospital[K]) => h && setH({ ...h, [k]: v });

  return (
    <AppShell staff={staff} onStaff={setStaff}>
      <div className="team">
        <header>
          <h1 style={{ margin: 0 }}>Hospital settings</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>How your hospital appears to patients, and the fee added after a visit.</p>
        </header>
        {error && <div className="error">{error}</div>}
        {note && <div className="ok-note" role="status">{note}</div>}
        {!h ? (
          !error && <p className="muted">Loading…</p>
        ) : (
          <div className="team-grid">
            <form className="team-card glass" onSubmit={save}>
              <h2>Details</h2>
              <label htmlFor="hs-name">Hospital or clinic name</label>
              <input id="hs-name" required minLength={2} value={h.name} onChange={(e) => set("name", e.target.value)} />
              <label htmlFor="hs-city">City</label>
              <input id="hs-city" value={h.city} onChange={(e) => set("city", e.target.value)} placeholder="Multan" />
              <label htmlFor="hs-address">Address</label>
              <input id="hs-address" value={h.address} onChange={(e) => set("address", e.target.value)} placeholder="Bosan Road, near Chungi No. 9" />
              <label htmlFor="hs-phone">Reception phone</label>
              <input id="hs-phone" inputMode="tel" value={h.phone} onChange={(e) => set("phone", e.target.value)} placeholder="061 1234567" />
              <label htmlFor="hs-email">Reception Gmail</label>
              <input id="hs-email" type="email" value={h.email} onChange={(e) => set("email", e.target.value)} placeholder="reception@gmail.com" />
              <label htmlFor="hs-hours">Opening hours</label>
              <input id="hs-hours" value={h.hours} onChange={(e) => set("hours", e.target.value)} placeholder="9 am to 9 pm, 7 days" />
              <label className="hs-check">
                <input type="checkbox" checked={h.emergency_24h} onChange={(e) => set("emergency_24h", e.target.checked)} />
                <span>Emergency open 24 hours</span>
              </label>
              <h2 style={{ marginTop: 8 }}>Visit fee</h2>
              <label htmlFor="hs-fee">Doctor&apos;s visit fee (Rs)</label>
              <input id="hs-fee" type="number" min={0} max={100000} step={50} value={h.visit_fee_pkr || ""}
                onChange={(e) => set("visit_fee_pkr", Number(e.target.value) || 0)} placeholder={`${h.standard_fee_pkr} (standard)`} />
              <p className="muted" style={{ margin: 0, fontSize: "0.8125rem" }}>
                Leave empty to use the standard Rs {h.standard_fee_pkr}. Patients are only charged after they were helped, and staff can waive any fee.
              </p>
              <button className="btn btn-primary" type="submit" disabled={busy || h.name.trim().length < 2}>{busy ? "Saving…" : "Save settings"}</button>
            </form>
            <section className="team-card glass">
              <h2>What patients see</h2>
              <div className="hs-preview">
                <b>{h.name || "Your hospital"}</b>
                <span>{[h.address, h.city].filter(Boolean).join(", ") || "Add an address"}</span>
                <span>{h.hours || "Add opening hours"}{h.emergency_24h ? " · Emergency 24/7" : ""}</span>
                <span>{h.phone || "Add a phone number"}{h.email ? ` · ${h.email}` : ""}</span>
                <span className="hs-fee">Visit fee after the visit: <b>Rs {h.fee_in_use_pkr}</b></span>
              </div>
              <h2 style={{ marginTop: 8 }}>Your patient link</h2>
              <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>Share it on WhatsApp, print it as a QR at reception, or put it on your Facebook page. Requests from it come straight to your desk.</p>
              <code className="hs-link">{h.patient_link}</code>
              <button type="button" className="chip-btn" onClick={() => {
                navigator.clipboard?.writeText(h.patient_link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
              }}>{copied ? "Copied" : "Copy link"}</button>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
