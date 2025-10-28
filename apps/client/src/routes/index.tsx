import { createFileRoute, redirect } from "@tanstack/react-router";
import { getLastTeamSlugOrId } from "@/lib/lastTeam";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const last = getLastTeamSlugOrId();
      console.log("[RootRoute] Last team from localStorage:", last);
      if (last && last.trim().length > 0) {
        console.log("[RootRoute] Redirecting to last team dashboard:", last);
        throw redirect({
          to: "/$teamSlugOrId/dashboard",
          params: { teamSlugOrId: last },
        });
      }
      console.log("[RootRoute] No last team found, redirecting to team picker");
    }
    throw redirect({ to: "/team-picker" });
  },
  component: () => null,
});
