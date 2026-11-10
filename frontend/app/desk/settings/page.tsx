import StaffGate from "../../../components/StaffGate";
import HospitalSettings from "../../../components/HospitalSettings";

export const metadata = { title: "Hospital settings | Sehat Saathi", robots: { index: false } };

export default function SettingsPage() {
  return (
    <StaffGate adminOnly>
      <HospitalSettings />
    </StaffGate>
  );
}
