import { stackServerApp } from "@/lib/utils/stack";
import { StackHandler } from "@stackframe/stack";
import { redirect } from "next/navigation";

export default async function Handler(props: {
  params: Promise<{ stack: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  // If force=true, sign out any existing user first, then show sign-in
  // This is used by the desktop app to show the account picker
  if (searchParams.force === "true") {
    const user = await stackServerApp.getUser();
    if (user) {
      // User is logged in - redirect to sign-out, which will then redirect to sign-in
      redirect(`/handler/sign-out?after_sign_out_url=/handler/sign-in`);
    }
    // No user - fall through to render sign-in normally
  }

  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
