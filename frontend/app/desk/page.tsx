import { Suspense } from "react";
import Desk from "../../components/Desk";

export const metadata = { title: "Clinic desk | Sehat Saathi" };

export default function DeskPage() {
  return (
    <Suspense fallback={<p className="empty">Loading the desk…</p>}>
      <Desk />
    </Suspense>
  );
}
