import "../../patient.css";
import { Suspense } from "react";
import GuardianWatch from "../../../components/GuardianWatch";

export const metadata = { title: "Guardian live status | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <GuardianWatch />
    </Suspense>
  );
}
