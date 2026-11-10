"use client";

import { useEffect } from "react";
import Link from "next/link";
import Logo from "../components/Logo";

/** Shown if any screen fails to load. The emergency number is always one tap away. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="legal" style={{ textAlign: "center", paddingTop: 72 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Logo href="/app" />
      </div>
      <h1>Something went wrong on this screen</h1>
      <p className="muted" lang="ur" dir="rtl" style={{ fontFamily: "var(--urdu), var(--sans)", lineHeight: 2 }}>
        اس صفحے میں مسئلہ آ گیا۔ دوبارہ کوشش کریں۔
      </p>
      <p className="muted">Your data is safe. Try again, or go back to the start.{error.digest ? ` (Ref: ${error.digest})` : ""}</p>
      <p style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <Link className="btn btn-quiet" href="/app">Open Sehat Saathi</Link>
        <a className="btn btn-quiet" href="tel:1122">Emergency: call 1122</a>
      </p>
    </main>
  );
}
