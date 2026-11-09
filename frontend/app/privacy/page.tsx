import LegalPage from "../../components/LegalPage";

export const metadata = { title: "Privacy | Sehat Saathi" };

export default function Page() {
  return (
    <LegalPage title="Privacy policy" updated="9 November 2026">
      <h2>What we collect</h2>
      <ul>
        <li>What you tell us when you ask for help: your message or voice note, your name, your phone number, and your email if you give one.</li>
        <li>Your location, only if you tap &quot;Share my location&quot;, so a responder can reach you.</li>
        <li>If you make an account: your password (stored scrambled, never readable), medicines you add, family members you add for check-ins, and your blood group if you join as a donor.</li>
      </ul>
      <h2>Who can see it</h2>
      <ul>
        <li>Only the doctors and staff of the hospital you sent your request to. Other hospitals on Sehat Saathi cannot see it.</li>
        <li>A responder sees only what they need to reach you: your name, number, pickup point and the hospital.</li>
        <li>A blood donor never sees who the patient is. A donor&apos;s number is shown to the hospital only after they say yes.</li>
        <li>Hospital reports and downloads do not include names or phone numbers.</li>
      </ul>
      <h2>How AI is used</h2>
      <p>Google Gemini reads your message to sort how urgent it is, write a short summary for the doctor, and reply in your language. It never diagnoses or prescribes, and a doctor makes every booking decision. Danger signs are checked by fixed rules that the AI cannot overrule.</p>
      <h2>Messages we send you</h2>
      <p>Booking confirmations, appointment reminders, and medicine or check-in reminders you turned on, by email, phone notification or in the app. You can turn phone notifications off in your phone&apos;s settings.</p>
      <h2>Deleting your data</h2>
      <p>Log in and choose &quot;Delete my account and data&quot; on your page. Your account, medicines, family check-ins, donor profile, messages and email are deleted. Requests already sent to a hospital stay in that hospital&apos;s medical record, but without your name, number or your own words.</p>
      <h2>Contact</h2>
      <p>For any privacy question, contact the hospital you used, or Sehat Saathi through the hospital desk.</p>
      <p className="muted">This page explains how the app works. Hospitals using Sehat Saathi are responsible for following the health-data laws that apply to them.</p>
    </LegalPage>
  );
}
