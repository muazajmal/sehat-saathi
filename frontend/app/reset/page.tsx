import { Suspense } from "react";
import { ResetPassword } from "../../components/Forgot";

export const metadata = { title: "New password | Sehat Saathi", robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <ResetPassword />
    </Suspense>
  );
}
