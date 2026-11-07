import Link from "next/link";

/** Speech bubble carrying a pulse line: a message that becomes care. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo-mark">
      <path
        d="M16 3C8.8 3 3 8.2 3 14.6c0 3.6 1.8 6.8 4.7 8.9L6.6 29l6.1-3.2c1 .2 2.1.4 3.3.4 7.2 0 13-5.2 13-11.6S23.2 3 16 3Z"
        fill="var(--logo-bg, #0b5d55)"
      />
      <path
        d="M8 15h4l2-4.5 3.5 9 2.2-4.5H24"
        fill="none"
        stroke="var(--logo-fg, #5fe3c4)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Logo({ href = "/", urdu = true }: { href?: string; urdu?: boolean }) {
  return (
    <Link href={href} className="logo" aria-label="Sehat Saathi home">
      <LogoMark />
      <span className="logo-word">Sehat Saathi</span>
      {urdu && <span className="logo-urdu urdu">صحت ساتھی</span>}
    </Link>
  );
}
