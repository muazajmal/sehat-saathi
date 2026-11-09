import "../../patient.css";
import { Suspense } from "react";
import MedicinesView from "../../../components/MedicinesView";

export const metadata = { title: "My medicines | Sehat Saathi" };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <MedicinesView />
    </Suspense>
  );
}
