"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useStackApp } from "@stackframe/stack";

export function PreviewLanding() {
  const app = useStackApp();

  const handleSignIn = () => {
    app.redirectToSignIn();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-6 text-5xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-6xl">
          Preview.new
        </h1>

        <p className="mb-8 text-xl text-neutral-600 dark:text-neutral-400">
          Automatic visual regression testing for every pull request.
        </p>

        <div className="mb-12 space-y-4 text-left">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              How it works
            </h3>
            <ol className="space-y-3 text-neutral-600 dark:text-neutral-400">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium dark:bg-neutral-800">
                  1
                </span>
                <span>Sign in and connect your GitHub repository</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium dark:bg-neutral-800">
                  2
                </span>
                <span>
                  Configure your dev server and environment variables
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium dark:bg-neutral-800">
                  3
                </span>
                <span>
                  Open a pull request - we&apos;ll automatically capture screenshots of
                  your changes
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium dark:bg-neutral-800">
                  4
                </span>
                <span>
                  Review visual changes directly in your GitHub PR comments
                </span>
              </li>
            </ol>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          <Button size="lg" onClick={handleSignIn}>
            Try now - Sign in
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="https://www.cmux.dev">Learn more</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
