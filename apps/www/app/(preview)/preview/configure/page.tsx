import { stackServerApp } from "@/lib/utils/stack";
import { redirect } from "next/navigation";
import { getConvex } from "@/lib/utils/get-convex";
import { api } from "@cmux/convex";
import { PreviewConfigure } from "@/components/preview/preview-configure";

export default async function PreviewConfigurePage() {
  const user = await stackServerApp.getUser();

  if (!user) {
    return redirect("/preview");
  }

  const { userId, primaryEmail } = user;

  if (!primaryEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-600 dark:text-neutral-400">
          Please verify your email to continue
        </p>
      </div>
    );
  }

  const selectedTeamId = user.selectedTeam?.id;
  if (!selectedTeamId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-600 dark:text-neutral-400">
          Please select a team to continue
        </p>
      </div>
    );
  }

  const convex = getConvex();

  // Get user's team from Convex
  const teamRecord = await convex.query(api.teams.getTeamByTeamId, {
    teamId: selectedTeamId,
  });

  if (!teamRecord) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-neutral-600 dark:text-neutral-400">Team not found</p>
      </div>
    );
  }

  // Get team's GitHub installations
  const installations = await convex.query(
    api.github.listTeamProviderConnections,
    {
      teamId: selectedTeamId,
    }
  );

  return (
    <PreviewConfigure
      user={{ userId, email: primaryEmail }}
      team={{ teamId: selectedTeamId, teamName: teamRecord.displayName }}
      installations={installations}
    />
  );
}
