import { Suspense } from "react";
import Desk from "../../components/Desk";
import StaffGate from "../../components/StaffGate";

export const metadata = { title: "Clinic desk | Sehat Saathi" };

export default function DeskPage() {
  return (
    <Suspense fallback={<p className="empty">Loading the desk…</p>}>
      <StaffGate>
        <Desk />
      </StaffGate>
    </Suspense>
  );
}
