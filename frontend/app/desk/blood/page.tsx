import StaffGate from "../../../components/StaffGate";
import BloodDesk from "../../../components/BloodDesk";

export const metadata = { title: "Blood donors | Sehat Saathi" };

export default function Page() {
  return (
    <StaffGate>
      <BloodDesk />
    </StaffGate>
  );
}
