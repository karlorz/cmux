import { SiteHeader } from "@/components/site-header";
import { fetchLatestRelease } from "@/lib/fetch-latest-release";
import { fetchGithubRepoStats } from "@/lib/fetch-github-stars";
import { stackServerApp } from "@/lib/utils/stack";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Code,
  GitPullRequest,
  Sparkles,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "cmux preview — automatic PR screenshots for every pull request",
  description:
    "Automatically capture visual previews of your application on every PR. Configure once, see screenshots on every pull request with cmux preview.",
};

export default async function PreviewLandingPage() {
  const user = await stackServerApp.getUser({ or: "return-null" });
  const [{ fallbackUrl, latestVersion, macDownloadUrls }, githubRepo] =
    await Promise.all([fetchLatestRelease(), fetchGithubRepoStats()]);

  // If user is already signed in, redirect to setup
  if (user) {
    redirect("/preview/setup");
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#030712] text-foreground">
      {/* Background gradients */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-20%] top-[-10%] h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-sky-500/30 via-purple-500/20 to-transparent blur-[160px]" />
        <div className="absolute right-[-15%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-gradient-to-tr from-blue-500/20 via-cyan-400/15 to-transparent blur-[180px]" />
        <div className="absolute inset-x-[10%] bottom-[-25%] h-[36rem] rounded-full bg-gradient-to-tl from-sky-500/20 to-transparent blur-[200px]" />
      </div>

      <SiteHeader
        fallbackUrl={fallbackUrl}
        latestVersion={latestVersion}
        macDownloadUrls={macDownloadUrls}
        linkPrefix="/"
        githubStars={githubRepo.stars}
        githubUrl={githubRepo.url}
      />

      {/* Hero Section */}
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 pt-24 text-center sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-neutral-300">
          <Camera className="h-3 w-3" aria-hidden />
          cmux preview
        </div>

        <div className="space-y-6">
          <h1 className="text-5xl font-bold text-white sm:text-6xl">
            See every PR
            <br />
            <span className="bg-gradient-to-r from-sky-400 to-cyan-400 bg-clip-text text-transparent">
              before you review
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-neutral-300">
            Automatically capture screenshots of your application on every pull
            request. Configure once, get visual previews forever.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/preview/setup"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3 text-sm font-semibold text-white transition hover:from-sky-600 hover:to-cyan-600"
          >
            Try now — Sign in
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
            href="#how-it-works"
          >
            See how it works
          </a>
        </div>
      </div>

      {/* Features Section */}
      <div
        id="how-it-works"
        className="mx-auto mt-32 max-w-6xl px-4 sm:px-6"
      >
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-neutral-300">
            Three simple steps to automatic PR screenshots
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Step 1 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_80px_-30px_rgba(56,189,248,0.3)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-cyan-500/20">
              <Code className="h-6 w-6 text-sky-300" aria-hidden />
            </div>
            <h3 className="mb-3 text-xl font-semibold text-white">
              1. Install cmux app
            </h3>
            <p className="text-sm text-neutral-300">
              Connect your GitHub repositories with the cmux app. Select which
              repos you want to monitor for pull requests.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_80px_-30px_rgba(56,189,248,0.3)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-cyan-500/20">
              <Zap className="h-6 w-6 text-sky-300" aria-hidden />
            </div>
            <h3 className="mb-3 text-xl font-semibold text-white">
              2. Configure environment
            </h3>
            <p className="text-sm text-neutral-300">
              Set up your dev server commands, environment variables, and
              browser preferences. We'll use this to capture screenshots.
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-[0_20px_80px_-30px_rgba(56,189,248,0.3)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/20 to-cyan-500/20">
              <GitPullRequest className="h-6 w-6 text-sky-300" aria-hidden />
            </div>
            <h3 className="mb-3 text-xl font-semibold text-white">
              3. Get automatic screenshots
            </h3>
            <p className="text-sm text-neutral-300">
              Every new PR triggers our browser agent. Screenshots are posted
              directly to the PR with a link to view details.
            </p>
          </div>
        </div>
      </div>

      {/* Benefits Section */}
      <div className="mx-auto mt-32 max-w-6xl px-4 sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-12 shadow-[0_30px_120px_-40px_rgba(56,189,248,0.4)]">
          <div className="mb-8 flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-sky-300" aria-hidden />
            <h2 className="text-3xl font-semibold text-white">
              Why use cmux preview?
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 text-sky-300"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold text-white">
                    Catch visual regressions early
                  </h3>
                  <p className="text-sm text-neutral-300">
                    See exactly what changed in your UI before merging code into
                    production.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 text-sky-300"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold text-white">
                    Speed up code review
                  </h3>
                  <p className="text-sm text-neutral-300">
                    Reviewers can see the actual changes without pulling the
                    branch locally.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 text-sky-300"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold text-white">
                    Intelligent screenshot selection
                  </h3>
                  <p className="text-sm text-neutral-300">
                    Claude analyzes your git diff to capture screenshots of
                    pages that actually changed.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 text-sky-300"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold text-white">
                    Works with your setup
                  </h3>
                  <p className="text-sm text-neutral-300">
                    Supports any dev server configuration, environment
                    variables, and browser preferences.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 text-sky-300"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold text-white">
                    Fully automated
                  </h3>
                  <p className="text-sm text-neutral-300">
                    Set it and forget it. Every PR gets screenshots
                    automatically, no manual work required.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 text-sky-300"
                  aria-hidden
                />
                <div>
                  <h3 className="font-semibold text-white">
                    Private repository support
                  </h3>
                  <p className="text-sm text-neutral-300">
                    Install once, works with all your private repos through the
                    GitHub app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="mx-auto mt-32 max-w-4xl px-4 pb-32 text-center sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/10 to-cyan-500/10 p-12">
          <h2 className="mb-4 text-3xl font-semibold text-white">
            Ready to see your PRs in action?
          </h2>
          <p className="mb-8 text-neutral-300">
            Sign in and configure your first preview in under 5 minutes.
          </p>
          <Link
            href="/preview/setup"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-8 py-4 text-base font-semibold text-white transition hover:from-sky-600 hover:to-cyan-600"
          >
            Get started now
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 text-sm text-neutral-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-white">
              <span className="font-semibold">Need help getting set up?</span>
            </div>
            <p>
              Our team can help you configure cmux preview for your specific
              workflow.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              href="https://cal.com/team/manaflow/meeting"
              rel="noopener noreferrer"
              target="_blank"
            >
              Talk to us
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              href="/"
            >
              Back to cmux home
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
