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
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined;
  const searchString = buildSearchString(resolvedSearchParams);

  if (!/^\d+$/.test(pullNumber)) {
    notFound();
  }

  redirect(
    `/${encodeURIComponent(teamSlugOrId)}/${encodeURIComponent(
      repo
    )}/pull/${encodeURIComponent(pullNumber)}${searchString}`
  );
}

function buildSearchString(
  params?: Record<string, string | string[] | undefined>
): string {
  if (!params) {
    return "";
  }

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "undefined") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        query.append(key, "");
        continue;
      }
      for (const entry of value) {
        if (typeof entry === "string") {
          query.append(key, entry);
        }
      }
      continue;
    }
    query.append(key, value);
  }

  const serialized = query.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}
