import { stackServerApp } from "@/lib/utils/stack";
import { StackHandler } from "@stackframe/stack";

export default async function Handler(props: {
  params: Promise<{ stack: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  // If force=true and user is signed in, sign them out first
  // This is used by the desktop app to show the account picker
  if (searchParams.force === "true") {
    const user = await stackServerApp.getUser();
    if (user) {
      await user.signOut();
    }
  }

  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
