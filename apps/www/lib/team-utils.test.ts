import { describe, expect, it } from "vitest";
import {
  getTeamSlugOrId,
  getTeamId,
  getTeamSlug,
  getTeamDisplayName,
  type StackTeam,
} from "./team-utils";

describe("getTeamSlugOrId", () => {
  it("returns slug when available", () => {
    const team = { slug: "my-slug", teamId: "tid", id: "id" } as StackTeam;
    expect(getTeamSlugOrId(team)).toBe("my-slug");
  });

  it("falls back to teamId when no slug", () => {
    const team = { slug: null, teamId: "tid", id: "id" } as StackTeam;
    expect(getTeamSlugOrId(team)).toBe("tid");
  });

  it("falls back to id when no slug or teamId", () => {
    const team = { slug: null, teamId: undefined, id: "id" } as StackTeam;
    expect(getTeamSlugOrId(team)).toBe("id");
  });

  it("returns empty string when nothing available", () => {
    const team = {} as StackTeam;
    expect(getTeamSlugOrId(team)).toBe("");
  });
});

describe("getTeamId", () => {
  it("returns teamId when available", () => {
    const team = { slug: "slug", teamId: "tid", id: "id" } as StackTeam;
    expect(getTeamId(team)).toBe("tid");
  });

  it("falls back to id when no teamId", () => {
    const team = { slug: "slug", id: "id" } as StackTeam;
    expect(getTeamId(team)).toBe("id");
  });

  it("falls back to slugOrId when neither teamId nor id", () => {
    const team = { slug: "my-slug" } as StackTeam;
    expect(getTeamId(team)).toBe("my-slug");
  });

  it("returns empty string when nothing available", () => {
    const team = {} as StackTeam;
    expect(getTeamId(team)).toBe("");
  });
});

describe("getTeamSlug", () => {
  it("returns slug when available", () => {
    const team = { slug: "my-slug", teamId: "tid" } as StackTeam;
    expect(getTeamSlug(team)).toBe("my-slug");
  });

  it("returns null when no slug", () => {
    const team = { teamId: "tid", id: "id" } as StackTeam;
    expect(getTeamSlug(team)).toBeNull();
  });

  it("returns null for undefined slug", () => {
    const team = { slug: undefined } as StackTeam;
    expect(getTeamSlug(team)).toBeNull();
  });

  it("returns null for null slug", () => {
    const team = { slug: null } as StackTeam;
    expect(getTeamSlug(team)).toBeNull();
  });
});

describe("getTeamDisplayName", () => {
  it("returns displayName when available", () => {
    const team = {
      displayName: "My Team",
      name: "team-name",
      slug: "slug",
    } as StackTeam;
    expect(getTeamDisplayName(team)).toBe("My Team");
  });

  it("falls back to name when no displayName", () => {
    const team = {
      displayName: null,
      name: "team-name",
      slug: "slug",
    } as StackTeam;
    expect(getTeamDisplayName(team)).toBe("team-name");
  });

  it("falls back to slugOrId when no displayName or name", () => {
    const team = { slug: "my-slug", teamId: "tid" } as StackTeam;
    expect(getTeamDisplayName(team)).toBe("my-slug");
  });

  it("returns empty string when nothing available", () => {
    const team = {} as StackTeam;
    expect(getTeamDisplayName(team)).toBe("");
  });

  it("returns empty displayName when set (nullish coalescing)", () => {
    const team = { displayName: "", name: "team-name" } as StackTeam;
    // ?? only triggers on null/undefined, not empty string
    expect(getTeamDisplayName(team)).toBe("");
  });
});
