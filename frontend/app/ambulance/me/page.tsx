import { Suspense } from "react";
import "../../patient.css";
import AmbulanceMe from "../../../components/AmbulanceMe";

export const metadata = { title: "Driver | Sehat Saathi", robots: { index: false } };

export default function DriverPage() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <AmbulanceMe />
    </Suspense>
  );
}
