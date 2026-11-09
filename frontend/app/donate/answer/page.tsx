import "../../patient.css";
import { Suspense } from "react";
import DonorAnswerView from "../../../components/DonorAnswerView";

export const metadata = { title: "Blood request | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <DonorAnswerView />
    </Suspense>
  );
}
