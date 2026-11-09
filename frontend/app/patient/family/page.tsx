import "../../patient.css";
import { Suspense } from "react";
import FamilyView from "../../../components/FamilyView";

export const metadata = { title: "Family check-ins | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <FamilyView />
    </Suspense>
  );
}
