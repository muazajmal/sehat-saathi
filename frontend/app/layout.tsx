import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sehat Saathi | The WhatsApp front desk for clinics",
  description: "The WhatsApp front desk for Pakistani clinics. Triage and booking in Urdu, Punjabi, Saraiki, Pashto, Sindhi and more, with a doctor approving every visit.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#040d0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;600&family=Noto+Naskh+Arabic:wght@400;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
