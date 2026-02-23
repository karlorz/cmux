import { stackServerApp } from "@/lib/utils/stack";
import { StackHandler } from "@stackframe/stack";
import { redirect } from "next/navigation";

export default async function Handler(props: {
  params: Promise<{ stack: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;

  // If force=true, redirect through reset-session to clear cookies first
  // This is used by the desktop app to show the account picker
  // We can't delete cookies directly in a Server Component, so we use the API route
  if (searchParams.force === "true") {
    const path = params.stack?.join("/") || "sign-in";
    redirect(`/api/auth/reset-session?returnTo=/handler/${path}`);
  }

  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
