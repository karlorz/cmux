import { api } from "@cmux/convex/api";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMemo } from "react";

interface UseTeamIdFromPathnameOptions {
  enabled?: boolean;
}

export function useTeamIdFromPathname(
  options: UseTeamIdFromPathnameOptions = {}
) {
  const { enabled = true } = options;

  const { pathname } = useRouterState({ select: (state) => state.location });
  const teamSlugOrId = useMemo(() => {
    const [maybeTeamSlugOrId] = pathname.split("/").filter(Boolean);
    return maybeTeamSlugOrId ?? null;
  }, [pathname]);

  const team = useQuery(
    api.teams.get,
    enabled && teamSlugOrId ? { teamSlugOrId } : "skip"
  );

  return {
    teamId: team?.uuid ?? null,
    teamSlugOrId,
  } as const;
}
