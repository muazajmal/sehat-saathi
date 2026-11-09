"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { session } from "../lib/api";
import { useSession } from "../lib/useSession";
import Logo from "./Logo";

/** Who signs desk decisions: the logged-in doctor/admin, or a typed name in open demo mode. */
export function useStaff() {
  const [staff, setStaff] = useState("");
  useEffect(() => {
    const s = session.get();
    if (s && s.account.role !== "patient") return setStaff(s.account.name);
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
function AmbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 16.5V8h11v8.5M13.5 11h4l3 3v2.5h-7.5" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
      <path d="M8 10v4M6 12h4" />
    </svg>
  );
}
function TeamIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6M16 5.5a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.6 2 3 4.4" />
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
  joining = 0,
}: {
  children: React.ReactNode;
  staff: string;
  onStaff: (v: string) => void;
  online?: boolean;
  urgent?: number;
  joining?: number;
}) {
  const path = usePathname();
  const router = useRouter();
  const { session: me, logout } = useSession();
  const account = me && me.account.role !== "patient" ? me.account : null;
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
          <Link href="/desk/ambulances" className="rail-link" aria-current={path === "/desk/ambulances" ? "page" : undefined}>
            <AmbIcon />
            <span className="label">Ambulances</span>
            {joining > 0 && <span className="rail-count" aria-label={`${joining} to check`}>{joining}</span>}
          </Link>
          <Link href="/desk/area" className="rail-link" aria-current={path === "/desk/area" ? "page" : undefined}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" />
            </svg>
            <span className="label">Area health</span>
          </Link>
          <Link href="/desk/blood" className="rail-link" aria-current={path === "/desk/blood" ? "page" : undefined}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />
            </svg>
            <span className="label">Blood</span>
          </Link>
          {account?.role === "admin" && (
            <Link href="/desk/team" className="rail-link" aria-current={path === "/desk/team" ? "page" : undefined}>
              <TeamIcon />
              <span className="label">Team</span>
            </Link>
          )}
          <Link href="/" className="rail-link">
            <SiteIcon />
            <span className="label">Website</span>
          </Link>
        </nav>
        <div className="rail-foot">
          <span className={`live${online ? "" : " off"}`}>{online ? "Live" : "Offline"}</span>
          {account ? (
            <div className="staff-card">
              <span className="avatar" aria-hidden>
                {initials(account.name)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <b className="staff-name" title={account.name}>{account.name}</b>
                <small>
                  {account.role === "admin" ? "Hospital admin" : "Doctor"} ·{" "}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      logout();
                      router.push("/login?as=staff");
                    }}
                  >
                    Log out
                  </button>
                </small>
              </span>
            </div>
          ) : (
            <label className="staff-card">
              <span className="avatar" aria-hidden>
                {initials(staff)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <input value={staff} onChange={(e) => onStaff(e.target.value)} placeholder="Your name" aria-label="Signed in as" />
                <small>Signs every decision</small>
              </span>
            </label>
          )}
        </div>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
