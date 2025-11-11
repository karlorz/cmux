import { stackServerApp } from "@/lib/utils/stack";
import { redirect } from "next/navigation";
import { PreviewLanding } from "@/components/preview/preview-landing";

export default async function PreviewPage() {
  const user = await stackServerApp.getUser();

  // If user is signed in, redirect to configuration
  if (user) {
    return redirect("/preview/configure");
  }

  return <PreviewLanding />;
}
