import { redirect } from "next/navigation";

/* Old onboarding page — replaced by floating OnboardingPanel in layout. */
export default function OnboardingPage() {
  redirect("/dashboard");
}
