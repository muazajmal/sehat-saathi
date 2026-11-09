import "../patient.css";
import { Suspense } from "react";
import FirstAidLibrary from "../../components/FirstAidLibrary";

export const metadata = {
  title: "First aid | Sehat Saathi",
  description: "Step-by-step first aid with pictures, captions and voice, in Urdu and English. Call 1122 first.",
};

export default function FirstAidPage() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <FirstAidLibrary />
    </Suspense>
  );
}
