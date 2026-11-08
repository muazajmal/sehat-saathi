import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "../components/PwaRegister";

export const metadata: Metadata = {
  title: "Sehat Saathi | The WhatsApp front desk for clinics",
  description: "The WhatsApp front desk for Pakistani clinics. Triage and booking in Urdu, Punjabi, Saraiki, Pashto, Sindhi and more, with a doctor approving every visit.",
  applicationName: "Sehat Saathi",
  appleWebApp: { capable: true, title: "Sehat Saathi", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
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
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
