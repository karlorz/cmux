import { stackServerApp } from "@/lib/utils/stack";
import { StackHandler } from "@stackframe/stack";
import { cookies } from "next/headers";

export default async function Handler(props: {
  params: Promise<{ stack: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  // If force=true, clear all Stack Auth cookies to force fresh sign-in
  // This is used by the desktop app to show the account picker
  if (searchParams.force === "true") {
    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.includes("stack-")) {
        cookieStore.delete(cookie.name);
      }
    }
  }

  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
