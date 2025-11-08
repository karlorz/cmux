import { notFound, redirect } from "next/navigation";

type PageParams = {
  teamSlugOrId: string;
  repo: string;
  pullNumber: string;
  segments: string[];
};

type PageProps = {
  params: Promise<PageParams>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function PullRequestCatchallPage({
  params,
  searchParams,
}: PageProps): Promise<never> {
  const { teamSlugOrId, repo, pullNumber } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!/^\d+$/.test(pullNumber)) {
    notFound();
  }

  const basePath = `/${encodeURIComponent(teamSlugOrId)}/${encodeURIComponent(
    repo
  )}/pull/${encodeURIComponent(pullNumber)}`;
  const querySuffix = serializeSearchParams(resolvedSearchParams);

  redirect(querySuffix ? `${basePath}?${querySuffix}` : basePath);
}

function serializeSearchParams(
  params: Record<string, string | string[] | undefined> | undefined
): string {
  if (!params) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "undefined") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          search.append(key, entry);
        }
      }
      continue;
    }
    search.append(key, value);
  }
  return search.toString();
}
