import { stackServerApp } from "@/lib/utils/stack";
import { StackHandler } from "@stackframe/stack";

export default async function Handler(props: {
  params: Promise<{ stack: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  if (searchParams.force === "true") {
    const user = await stackServerApp.getUser();
    if (user) {
      await user.signOut();
    }
  }

  return <StackHandler fullPage app={stackServerApp} routeProps={props} />;
}
