import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "../components/PwaRegister";

export const metadata: Metadata = {
  title: "Sehat Saathi | The WhatsApp front desk for clinics",
  description: "The WhatsApp front desk for Pakistani clinics. Triage and booking in Urdu, Punjabi, Saraiki, Pashto, Sindhi and more, with a doctor approving every visit.",
  applicationName: "Sehat Saathi",
  appleWebApp: { capable: true, title: "Sehat Saathi", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  metadataBase: new URL("https://sehat-saathi-eta.vercel.app"),
  keywords: ["Sehat Saathi", "Urdu health assistant", "clinic triage Pakistan", "hospital front desk", "emergency 1122", "elder SOS"],
  openGraph: {
    type: "website",
    siteName: "Sehat Saathi · صحت ساتھی",
    title: "Sehat Saathi: AI health helper for Pakistani communities",
    description: "Describe your problem in Urdu or your own language. AI sorts how urgent it is, a doctor approves every visit, and emergencies get 1122, first aid and guardian alerts.",
    locale: "en_PK",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sehat Saathi: AI health helper for Pakistani communities",
    description: "Urdu-first triage and booking with a doctor approving every visit.",
  },
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
