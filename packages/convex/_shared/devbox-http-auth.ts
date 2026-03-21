import { internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { ActionCtx } from "../convex/_generated/server";
import { jsonResponse } from "./http-utils";

type AuthorizationFailure = {
  ok: false;
  response: Response;
};

type AuthorizedTeam = {
  ok: true;
  teamId: string;
};

export type DevboxTeamAuthorizationResult =
  | AuthorizationFailure
  | AuthorizedTeam;

export type DevboxInstanceAuthorizationResult =
  | AuthorizationFailure
  | (AuthorizedTeam & { instance: Doc<"devboxInstances"> });

export async function requireDevboxTeamAccessForHttp(
  ctx: ActionCtx,
  teamSlugOrId: string,
  userId: string
): Promise<DevboxTeamAuthorizationResult> {
  const team = await ctx.runQuery(internal.teams.getBySlugOrIdInternal, {
    slugOrId: teamSlugOrId,
  });
  const memberships = await ctx.runQuery(
    internal.teams.getMembershipsByUserIdInternal,
    { userId }
  );

  if (team) {
    const hasMembership = memberships.some((membership) => {
      return membership.teamId === team.teamId;
    });

    if (!hasMembership) {
      return {
        ok: false,
        response: jsonResponse(
          { code: 403, message: `You are not a member of team: ${teamSlugOrId}` },
          403
        ),
      };
    }

    return { ok: true, teamId: team.teamId };
  }

  // Back-compat for legacy string teamIds that may still exist in membership rows.
  const legacyMembership = memberships.find((membership) => {
    return membership.teamId === teamSlugOrId;
  });
  if (legacyMembership) {
    return { ok: true, teamId: legacyMembership.teamId };
  }

  return {
    ok: false,
    response: jsonResponse(
      { code: 404, message: `Team not found: ${teamSlugOrId}` },
      404
    ),
  };
}

export async function requireDevboxInstanceAccessForHttp(
  ctx: ActionCtx,
  id: string,
  teamSlugOrId: string,
  userId: string
): Promise<DevboxInstanceAuthorizationResult> {
  const teamAccess = await requireDevboxTeamAccessForHttp(
    ctx,
    teamSlugOrId,
    userId
  );
  if (!teamAccess.ok) {
    return teamAccess;
  }

  const instance = await ctx.runQuery(internal.devboxInstances.getByIdInternal, {
    id,
  });
  if (
    !instance ||
    instance.teamId !== teamAccess.teamId ||
    instance.userId !== userId
  ) {
    return {
      ok: false,
      response: jsonResponse(
        { code: 404, message: "Instance not found" },
        404
      ),
    };
  }

  return {
    ok: true,
    teamId: teamAccess.teamId,
    instance,
  };
}
