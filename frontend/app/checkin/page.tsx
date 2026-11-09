import "../patient.css";
import { Suspense } from "react";
import CheckinView from "../../components/CheckinView";

export const metadata = { title: "Daily check-in | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <CheckinView />
    </Suspense>
  );
}
