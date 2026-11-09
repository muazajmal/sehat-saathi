import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Terms | Sehat Saathi" };

export default function Page() {
  return (
    <LegalPage title="Terms of use" updated="9 November 2026">
      <h2>Not an emergency service</h2>
      <p>In an emergency, call <a href="tel:1122">1122</a> first. Sehat Saathi helps you reach a doctor; it does not replace emergency services.</p>
      <h2>Not a diagnosis</h2>
      <p>Sehat Saathi sorts requests, holds appointment times and shares first-aid steps from recognised guidance. It does not diagnose or prescribe. Medical decisions are made by the hospital&apos;s doctors.</p>
      <h2>Medicine reminders</h2>
      <p>Reminders follow the prescription as you saved it. Always check doses with your doctor or pharmacist; Sehat Saathi never changes what your doctor wrote.</p>
      <h2>Payments</h2>
      <p>Asking for help is free. Any fee for a visit or a ride is shown before it is charged and can be waived by the hospital.</p>
      <h2>Your account</h2>
      <p>Keep your password private. Don&apos;t send false requests or misuse the service; repeated misuse may be blocked.</p>
      <h2>Hospitals</h2>
      <p>Each hospital controls its own desk, doctors and patient records, and is responsible for the care it provides.</p>
    </LegalPage>
  );
}
