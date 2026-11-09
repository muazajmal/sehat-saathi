import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="legal">
      <Logo href="/app" />
      <h1>{title}</h1>
      <p className="muted">Last updated {updated}. Written in plain words; ask us if anything is unclear.</p>
      {children}
      <p className="muted" style={{ marginTop: 32 }}>
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/app">Back to Sehat Saathi</Link>
      </p>
    </main>
  );
}
