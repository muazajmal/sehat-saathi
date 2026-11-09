import "../patient.css";
import { Suspense } from "react";
import DonateView from "../../components/DonateView";

export const metadata = { title: "Donate blood | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <DonateView />
    </Suspense>
  );
}
