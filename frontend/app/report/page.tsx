import "../patient.css";
import ReportSamjhao from "../../components/ReportSamjhao";

export const metadata = {
  title: "Report Samjhao | Sehat Saathi",
  description: "AI summary of a long lab report: one line, 3 bullets or detailed, in English or Urdu, with every number checked against the report.",
};

export default function ReportPage() {
  return <ReportSamjhao />;
}
