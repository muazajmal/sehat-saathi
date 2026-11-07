"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "./Logo";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#safety", label: "Safety" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export default function SiteNav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav${solid || open ? " nav-solid" : ""}`}>
      <div className="wrap nav-inner">
        <Logo />
        <nav className={`nav-links${open ? " open" : ""}`} aria-label="Main">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link href="/desk" className="nav-mobile-only" onClick={() => setOpen(false)}>
            Clinic desk
          </Link>
        </nav>
        <div className="nav-cta">
          <Link href="/desk" className="nav-signin">
            Clinic desk
          </Link>
          <a href="#demo" className="btn btn-mint">
            Book a demo
          </a>
          <button
            className="nav-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
