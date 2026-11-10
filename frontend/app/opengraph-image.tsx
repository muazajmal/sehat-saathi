import { ImageResponse } from "next/og";

export const alt = "Sehat Saathi · صحت ساتھی — AI health helper for Pakistani communities";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when the link is shared on WhatsApp, LinkedIn or X. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "64px 72px", color: "#eaf5f2", fontFamily: "sans-serif",
          background: "radial-gradient(circle at 80% 20%, #0f5a4b 0%, #05201c 45%, #040d0c 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "#5fe3c4", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#04201b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l2-5 4 10 2-5h6" />
            </svg>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Sehat Saathi</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>Health help in your own language.</div>
          <div style={{ fontSize: 30, color: "#a9c9c1", lineHeight: 1.35 }}>
            AI sorts how urgent it is. A doctor approves every visit. Emergencies get 1122, first aid and guardian alerts.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24 }}>
          {["Urdu · Punjabi · Saraiki · Pashto · Sindhi", "Doctor approves every visit", "Elder SOS"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, border: "2px solid #2f7d6c", color: "#cfeee6" }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
