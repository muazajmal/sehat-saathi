import "../patient.css";
import { Suspense } from "react";
import ElderApp from "../../components/ElderApp";

export const metadata = {
  title: "Elder app | Sehat Saathi",
  description: "One big help button for older people. Family and hospital are told at once.",
};

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <ElderApp />
    </Suspense>
  );
}
