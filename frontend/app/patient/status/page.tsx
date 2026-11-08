import { Suspense } from "react";
import PatientStatusView from "../../../components/PatientStatusView";

export const metadata = { title: "Your request | Sehat Saathi", robots: { index: false } };

export default function PatientStatusPage() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <PatientStatusView />
    </Suspense>
  );
}
