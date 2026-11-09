import { Suspense } from "react";
import LoginView from "../../components/LoginView";

export const metadata = {
  title: "Log in | Sehat Saathi",
  description: "Patients see their requests. Doctors and hospital admins open the desk.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="empty">Loading…</p>}>
      <LoginView />
    </Suspense>
  );
}
