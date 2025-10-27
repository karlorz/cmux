import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/utils/www-env";
import { OpenCmuxClient } from "./OpenCmuxClient";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AfterSignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const stackCookies = await cookies();
  const stackRefreshToken = stackCookies.get(`stack-refresh-${env.NEXT_PUBLIC_STACK_PROJECT_ID}`)?.value;
  const stackAccessToken = stackCookies.get(`stack-access`)?.value;

  if (!stackRefreshToken || !stackAccessToken) {
    // No auth tokens, redirect to sign in
    redirect("/handler/sign-in");
  }

  // Check if this request came from Electron
  const isElectron = params.is_electron === "true";

  // Get the return URL if provided
  const returnTo = typeof params.return_to === "string" ? params.return_to : null;

  if (isElectron) {
    // Electron context: redirect to deep link
    const target = `cmux://auth-callback?stack_refresh=${encodeURIComponent(stackRefreshToken)}&stack_access=${encodeURIComponent(stackAccessToken)}`;
    return <OpenCmuxClient href={target} />;
  } else {
    // Web context: redirect back to the original URL or default to home
    const destination = returnTo || "/";
    redirect(destination);
  }
}
