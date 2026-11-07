"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

export function useStaff() {
  const [staff, setStaff] = useState("");
  useEffect(() => {
    try {
      setStaff(localStorage.getItem("sehat.staff") ?? "");
    } catch {}
  }, []);
  const update = (v: string) => {
    setStaff(v);
    try {
      localStorage.setItem("sehat.staff", v);
    } catch {}
  };
  return [staff, update] as const;
}

const initials = (name: string) =>
  name
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

function QueueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}
function CalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function SiteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" />
    </svg>
  );
}

export default function AppShell({
  children,
  staff,
  onStaff,
  online = true,
  urgent = 0,
}: {
  children: React.ReactNode;
  staff: string;
  onStaff: (v: string) => void;
  online?: boolean;
  urgent?: number;
}) {
  const path = usePathname();
  return (
    <div className="app">
      <aside className="rail">
        <Logo href="/" />
        <nav aria-label="Desk">
          <Link href="/desk" className="rail-link" aria-current={path === "/desk" ? "page" : undefined}>
            <QueueIcon />
            <span className="label">Queue</span>
            {urgent > 0 && <span className="rail-count" aria-label={`${urgent} urgent`}>{urgent}</span>}
          </Link>
          <Link href="/desk/schedule" className="rail-link" aria-current={path === "/desk/schedule" ? "page" : undefined}>
            <CalIcon />
            <span className="label">Schedule</span>
          </Link>
          <Link href="/" className="rail-link">
            <SiteIcon />
            <span className="label">Website</span>
          </Link>
        </nav>
        <div className="rail-foot">
          <span className={`live${online ? "" : " off"}`}>{online ? "Live" : "Offline"}</span>
          <label className="staff-card">
            <span className="avatar" aria-hidden>
              {initials(staff)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <input value={staff} onChange={(e) => onStaff(e.target.value)} placeholder="Your name" aria-label="Signed in as" />
              <small>Signs every decision</small>
            </span>
          </label>
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
