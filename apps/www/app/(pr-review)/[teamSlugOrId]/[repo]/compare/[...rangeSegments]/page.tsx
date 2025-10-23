import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ExternalLink } from "lucide-react";

import { PullRequestDiffViewer } from "@/components/pr/pull-request-diff-viewer";
import {
  fetchCompare,
  type GithubCompare,
  type GithubCompareFile,
} from "@/lib/github/fetch-pull-request";
import { isGithubApiError } from "@/lib/github/errors";
import { stackServerApp } from "@/lib/utils/stack";

import type { DiffFile } from "@/components/pr/pull-request-diff-viewer";

type PageParams = {
  teamSlugOrId: string;
  repo: string;
  rangeSegments: string[];
};

type PageProps = {
  params: Promise<PageParams>;
};

export const dynamic = "force-dynamic";

async function getFirstTeam() {
  const teams = await stackServerApp.listTeams();
  return teams[0] ?? null;
}

function parseCompareTarget(segments: string[]): {
  base: string;
  head: string;
  raw: string;
} | null {
  if (segments.length === 0) {
    return null;
  }

  const joined = segments.join("/");
  const decoded = decodeURIComponent(joined);
  const delimiterIndex = decoded.indexOf("...");

  if (delimiterIndex === -1) {
    return null;
  }

  const base = decoded.slice(0, delimiterIndex);
  const head = decoded.slice(delimiterIndex + 3);

  if (!base || !head) {
    return null;
  }

  return {
    base,
    head,
    raw: `${base}...${head}`,
  };
}

function mapCompareFilesToDiffFiles(files: GithubCompareFile[]): DiffFile[] {
  return files.map((file) => ({
    filename: file.filename,
    status: file.status,
    previous_filename: file.previous_filename,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
  }));
}

function summarizeFiles(files: DiffFile[]): {
  fileCount: number;
  additions: number;
  deletions: number;
} {
  return files.reduce(
    (acc, file) => {
      acc.fileCount += 1;
      acc.additions += file.additions;
      acc.deletions += file.deletions;
      return acc;
    },
    { fileCount: 0, additions: 0, deletions: 0 }
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const user = await stackServerApp.getUser({ or: "redirect" });
  const selectedTeam = user.selectedTeam || (await getFirstTeam());

  if (!selectedTeam) {
    throw notFound();
  }

  const { teamSlugOrId: githubOwner, repo, rangeSegments } = await params;
  const target = parseCompareTarget(rangeSegments);

  if (!target) {
    return {
      title: `Invalid comparison • ${githubOwner}/${repo}`,
    };
  }

  try {
    const comparison = await fetchCompare(
      githubOwner,
      repo,
      target.base,
      target.head
    );

    const commitsLabel = comparison.total_commits === 1
      ? "1 commit"
      : `${comparison.total_commits} commits`;

    return {
      title: `${target.raw} · ${githubOwner}/${repo}`,
      description: `Comparing ${target.raw} with ${commitsLabel}.`,
    };
  } catch (error) {
    if (
      isGithubApiError(error) &&
      (error.status === 404 || error.status === 422)
    ) {
      return {
        title: `${githubOwner}/${repo} · ${target.raw}`,
      };
    }

    throw error;
  }
}

export default async function ComparePage({ params }: PageProps) {
  const user = await stackServerApp.getUser({ or: "redirect" });
  const selectedTeam = user.selectedTeam || (await getFirstTeam());

  if (!selectedTeam) {
    throw notFound();
  }

  const { teamSlugOrId: githubOwner, repo, rangeSegments } = await params;
  const target = parseCompareTarget(rangeSegments);

  if (!target) {
    notFound();
  }

  let comparison: GithubCompare;

  try {
    comparison = await fetchCompare(
      githubOwner,
      repo,
      target.base,
      target.head
    );
  } catch (error) {
    if (
      isGithubApiError(error) &&
      (error.status === 404 || error.status === 422)
    ) {
      notFound();
    }

    throw error;
  }

  const diffFiles = mapCompareFilesToDiffFiles(comparison.files ?? []);
  const totals = summarizeFiles(diffFiles);
  const repoFullName = `${githubOwner}/${repo}`;
  const githubUrl = `https://github.com/${repoFullName}/compare/${encodeURIComponent(
    target.base
  )}...${encodeURIComponent(target.head)}`;

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <div className="flex w-full flex-col gap-8 px-6 pb-16 pt-10 sm:px-8 lg:px-12">
        <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-neutral-200 px-2 py-0.5 font-semibold uppercase tracking-wide text-neutral-700">
                  Comparison
                </span>
                <span className="font-mono text-neutral-500">{repoFullName}</span>
              </div>

              <h1 className="mt-2 text-xl font-semibold leading-tight text-neutral-900">
                {target.base} <span className="text-neutral-400">...</span> {target.head}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                <span>{comparison.total_commits} commit{comparison.total_commits === 1 ? "" : "s"}</span>
                <span className="text-neutral-400">•</span>
                <span>
                  Ahead by {comparison.ahead_by} · Behind by {comparison.behind_by}
                </span>
              </div>
            </div>

            <GitHubLinkButton href={githubUrl} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Files changed
              </h2>
              <p className="text-sm text-neutral-600">
                {totals.fileCount} file{totals.fileCount === 1 ? "" : "s"}, {totals.additions} additions, {totals.deletions} deletions
              </p>
            </div>
          </header>

          <PullRequestDiffViewer
            files={diffFiles}
            teamSlugOrId={selectedTeam.id}
            repoFullName={repoFullName}
            prNumber={0}
          />
        </section>
      </div>
    </div>
  );
}

function GitHubLinkButton({ href }: { href: string }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      GitHub
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}
