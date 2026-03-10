import { stackServerApp } from "@/lib/utils/stack";
import { env } from "@/lib/utils/www-env";
import { ConnectGitHubClient } from "./ConnectGitHubClient";

export const dynamic = "force-dynamic";

type ConnectGitHubPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

export default async function ConnectGitHubPage({
  searchParams: searchParamsPromise,
}: ConnectGitHubPageProps) {
  const user = await stackServerApp.getUser({ or: "redirect" });
  const searchParams = await searchParamsPromise;
  const teamSlugOrId = getSingleValue(searchParams?.team);
  const isReconnect = getSingleValue(searchParams?.reconnect) === "1";

  // For web reconnect flow, we want to return to settings page after OAuth
  // The returnUrl will be stored in sessionStorage by ConnectGitHubClient
  const webReturnUrl = isReconnect && teamSlugOrId
    ? `/${teamSlugOrId}/settings?section=general`
    : null;

  // Check if GitHub is already connected
  const githubAccount = await user.getConnectedAccount("github");

  if (githubAccount && !isReconnect) {
    // Already connected (and not forcing reconnect) - redirect to deep link immediately
    const protocol = env.NEXT_PUBLIC_CMUX_PROTOCOL ?? "cmux-next";
    const deepLinkHref = teamSlugOrId
      ? `${protocol}://github-connect-complete?team=${encodeURIComponent(teamSlugOrId)}`
      : `${protocol}://github-connect-complete`;

    // Use client component to trigger deep link
    return <ConnectGitHubClient href={deepLinkHref} alreadyConnected />;
  }

  // Not connected or forcing reconnect - show client component to initiate OAuth
  return <ConnectGitHubClient teamSlugOrId={teamSlugOrId} webReturnUrl={webReturnUrl} />;
}
