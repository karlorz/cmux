import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PreviewConfigureClient } from "@/components/preview/preview-configure-client";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerApp } from "@/lib/utils/stack";
import { api } from "@cmux/convex/api";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type StackTeam = Awaited<ReturnType<typeof stackServerApp.listTeams>>[number];

function buildConfigurePath(search: Record<string, string | string[] | undefined> | undefined): string {
  const params = new URLSearchParams();
  if (search) {
    Object.entries(search).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry) params.append(key, entry);
        });
      } else if (value) {
        params.set(key, value);
      }
    });
  }
  const query = params.toString();
  return query ? `/preview/configure?${query}` : "/preview/configure";
}

function getTeamSlugOrId(team: StackTeam): string {
  const candidate = team as unknown as {
    slug?: string | null;
    teamId?: string;
    id?: string;
  };
  return candidate.slug ?? candidate.teamId ?? candidate.id ?? "";
}

function getTeamId(team: StackTeam): string {
  const candidate = team as unknown as {
    teamId?: string;
    id?: string;
  };
  return candidate.teamId ?? candidate.id ?? getTeamSlugOrId(team);
}

function getTeamSlug(team: StackTeam): string | null {
  const candidate = team as unknown as { slug?: string | null };
  return candidate.slug ?? null;
}

function getTeamDisplayName(team: StackTeam): string {
  const candidate = team as unknown as {
    displayName?: string | null;
    name?: string | null;
  };
  return candidate.displayName ?? candidate.name ?? getTeamSlugOrId(team);
}

export default async function PreviewConfigurePage({ searchParams }: PageProps) {
  const resolvedSearch = await searchParams;
  const configurePath = buildConfigurePath(resolvedSearch);

  const user = await stackServerApp.getUser();

  // If user is not authenticated, redirect to sign-in
  if (!user) {
    const signInUrl = `/handler/sign-in?after_auth_return_to=${encodeURIComponent(configurePath)}`;
    return redirect(signInUrl);
  }

  const [{ accessToken }, teams] = await Promise.all([
    user.getAuthJson(),
    user.listTeams(),
  ]);

  if (teams.length === 0) {
    notFound();
  }

  if (!accessToken) {
    throw new Error("Missing Stack access token");
  }

  const repo = (() => {
    if (!resolvedSearch) {
      return null;
    }
    const value = resolvedSearch.repo;
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value ?? null;
  })();

  const installationId = (() => {
    if (!resolvedSearch) {
      return null;
    }
    const value = resolvedSearch.installationId;
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value ?? null;
  })();

  if (!repo) {
    notFound();
  }

  const searchTeam = (() => {
    if (!resolvedSearch) {
      return null;
    }
    const value = resolvedSearch.team;
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value ?? null;
  })();

  const selectedTeam =
    teams.find(
      (team) =>
        Boolean(searchTeam) &&
        getTeamDisplayName(team).toLowerCase() === searchTeam?.toLowerCase()
    ) ||
    teams.find((team) => getTeamSlugOrId(team) === searchTeam) ||
    teams[0];
  const selectedTeamSlugOrId = getTeamSlugOrId(selectedTeam);

  const convex = getConvex({ accessToken });
  const providerConnections = await convex.query(api.github.listProviderConnections, {
    teamSlugOrId: selectedTeamSlugOrId,
  });

  const hasGithubAppInstallation = providerConnections.some(
    (connection) => connection.isActive,
  );

  if (!hasGithubAppInstallation) {
    const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
    if (!githubAppSlug) {
      throw new Error("GitHub App slug is not configured");
    }

    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    const protocol = headerList.get("x-forwarded-proto") ?? "https";
    const returnUrl =
      host && configurePath.startsWith("/")
        ? `${protocol}://${host}${configurePath}`
        : configurePath;

    const { state } = await convex.mutation(api.github_app.mintInstallState, {
      teamSlugOrId: selectedTeamSlugOrId,
      returnUrl,
    });

    const url = new URL(`https://github.com/apps/${githubAppSlug}/installations/new`);
    url.searchParams.set("state", state);
    return redirect(url.toString());
  }

  const clientTeams = teams.map((team) => ({
    id: getTeamId(team),
    slug: getTeamSlug(team),
    slugOrId: getTeamSlugOrId(team),
    displayName: getTeamDisplayName(team),
    name:
      (team as unknown as { name?: string | null }).name ??
      getTeamDisplayName(team),
  }));

  return (
    <PreviewConfigureClient
      initialTeamSlugOrId={selectedTeamSlugOrId}
      teams={clientTeams}
      repo={repo}
      installationId={installationId}
    />
  );
}
