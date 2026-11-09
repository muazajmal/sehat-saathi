import Link from "next/link";
import Logo from "../components/Logo";

export const metadata = { title: "Page not found | Sehat Saathi" };

export default function NotFound() {
  return (
    <main className="legal" style={{ textAlign: "center", paddingTop: 72 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Logo href="/app" />
      </div>
      <h1>This page doesn&apos;t exist</h1>
      <p className="muted" lang="ur" dir="rtl" style={{ fontFamily: "var(--urdu), var(--sans)", lineHeight: 2 }}>
        یہ صفحہ موجود نہیں۔
      </p>
      <p className="muted">The link may be old or typed wrong.</p>
      <p style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
        <Link className="btn btn-primary" href="/app">Open Sehat Saathi</Link>
        <a className="btn btn-quiet" href="tel:1122">Emergency: call 1122</a>
      </p>
    </main>
  );
}
