import StaffGate from "../../../components/StaffGate";
import Reports from "../../../components/Reports";

export const metadata = { title: "Reports | Sehat Saathi" };

export default function Page() {
  return (
    <StaffGate>
      <Reports />
    </StaffGate>
  );
}
