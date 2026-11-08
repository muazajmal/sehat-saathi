import Ambulances from "../../../components/Ambulances";
import StaffGate from "../../../components/StaffGate";

export const metadata = { title: "Ambulances | Sehat Saathi" };

export default function AmbulancesPage() {
  return (
    <StaffGate>
      <Ambulances />
    </StaffGate>
  );
}
