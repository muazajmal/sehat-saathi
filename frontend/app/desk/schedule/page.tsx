import Schedule from "../../../components/Schedule";
import StaffGate from "../../../components/StaffGate";

export const metadata = { title: "Schedule | Sehat Saathi" };

export default function SchedulePage() {
  return (
    <StaffGate>
      <Schedule />
    </StaffGate>
  );
}
