import StaffGate from "../../../components/StaffGate";
import AreaHealth from "../../../components/AreaHealth";

export const metadata = { title: "Area health | Sehat Saathi" };

export default function Page() {
  return (
    <StaffGate>
      <AreaHealth />
    </StaffGate>
  );
}
