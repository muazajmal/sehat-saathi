import StaffGate from "../../../components/StaffGate";
import Team from "../../../components/Team";

export const metadata = { title: "Team | Sehat Saathi" };

export default function TeamPage() {
  return (
    <StaffGate adminOnly>
      <Team />
    </StaffGate>
  );
}
