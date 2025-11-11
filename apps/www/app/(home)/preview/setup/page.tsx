import { SiteHeader } from "@/components/site-header";
import { fetchLatestRelease } from "@/lib/fetch-latest-release";
import { fetchGithubRepoStats } from "@/lib/fetch-github-stars";
import { stackServerApp } from "@/lib/utils/stack";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RepoSelectionFlow } from "./_components/repo-selection-flow";

export const metadata: Metadata = {
  title: "Setup cmux preview — select repositories",
  description: "Select repositories and configure automatic PR screenshots.",
};

export default async function PreviewSetupPage() {
  const user = await stackServerApp.getUser({ or: "return-null" });

  // Require authentication
  if (!user) {
    redirect("/sign-in?after_auth_return_to=/preview/setup");
  }

  const selectedTeam = user.selectedTeam;
  if (!selectedTeam) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-neutral-900">
            No team selected
          </h1>
          <p className="mt-4 text-neutral-600">
            Please select or create a team to continue with preview setup.
          </p>
        </div>
      </div>
    );
  }

  const [{ fallbackUrl, latestVersion, macDownloadUrls }, githubRepo] =
    await Promise.all([fetchLatestRelease(), fetchGithubRepoStats()]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#030712] text-foreground">
      {/* Background gradients */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-20%] top-[-10%] h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-sky-500/30 via-purple-500/20 to-transparent blur-[160px]" />
        <div className="absolute right-[-15%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-blue-500/20 via-cyan-400/15 to-transparent blur-[180px]" />
      </div>

      <SiteHeader
        fallbackUrl={fallbackUrl}
        latestVersion={latestVersion}
        macDownloadUrls={macDownloadUrls}
        linkPrefix="/"
        githubStars={githubRepo.stars}
        githubUrl={githubRepo.url}
      />

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <RepoSelectionFlow
          teamId={selectedTeam.id}
          teamDisplayName={selectedTeam.displayName || "Your team"}
        />
      </div>
    </div>
  );
}
