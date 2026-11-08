import { Suspense } from "react";
import "../patient.css";
import ResponderApp from "../../components/ResponderApp";

export const metadata = { title: "Responder | Sehat Saathi", robots: { index: false } };

export default function ResponderPage() {
  return (
    <Suspense fallback={<p className="empty">Loading the trip…</p>}>
      <ResponderApp />
    </Suspense>
  );
}
