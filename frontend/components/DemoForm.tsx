"use client";

import { useState } from "react";
import { api, ApiError } from "../lib/api";

export default function DemoForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? "").trim(),
      clinic: String(f.get("clinic") ?? "").trim(),
      city: String(f.get("city") ?? "").trim(),
      phone: String(f.get("phone") ?? "").trim(),
      email: String(f.get("email") ?? "").trim(),
      size: String(f.get("size") ?? ""),
    };
    setState("sending");
    setError(null);
    try {
      await api.lead(body);
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? err.message : "Couldn't send the request. Check your connection and try again.");
    }
  }

  if (state === "sent") {
    return (
      <div className="demo-form demo-sent" role="status">
        <h3>Demo requested</h3>
        <p>We&apos;ll call you within one working day to set up a 20-minute walkthrough with your own clinic&apos;s schedule. A confirmation is on its way to your Gmail.</p>
      </div>
    );
  }

  return (
    <form className="demo-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" required minLength={2} autoComplete="name" placeholder="Dr. Imran Shah" />
      </div>
      <div className="field">
        <label htmlFor="clinic">Clinic or hospital</label>
        <input id="clinic" name="clinic" required minLength={2} autoComplete="organization" placeholder="Care Family Clinic" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" autoComplete="address-level2" placeholder="Lahore" />
        </div>
        <div className="field">
          <label htmlFor="size">Doctors</label>
          <select id="size" name="size" defaultValue="2-5">
            <option value="1">1</option>
            <option value="2-5">2 to 5</option>
            <option value="6-20">6 to 20</option>
            <option value="20+">More than 20</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="phone">WhatsApp number</label>
        <input id="phone" name="phone" required minLength={7} type="tel" autoComplete="tel" placeholder="0300 1234567" />
      </div>
      <div className="field">
        <label htmlFor="email">Gmail</label>
        <input id="email" name="email" required type="email" autoComplete="email" inputMode="email" placeholder="clinic@gmail.com" />
      </div>
      {error && <div className="error">{error}</div>}
      <button className="btn btn-mint btn-lg" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Book a demo"}
      </button>
      <p className="form-note">Free 30-day pilot. No card, no setup fee.</p>
    </form>
  );
}
