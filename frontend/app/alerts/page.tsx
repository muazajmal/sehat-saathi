import "../patient.css";
import { Suspense } from "react";
import AlertsView from "../../components/AlertsView";

export const metadata = { title: "Area health alerts | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <AlertsView />
    </Suspense>
  );
}
