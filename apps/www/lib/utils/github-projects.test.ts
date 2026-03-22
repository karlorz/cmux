import { describe, expect, it } from "vitest";
import {
  mapCmuxStatusToProjectStatus,
  mapProjectStatusToCmux,
  PROJECT_QUERIES,
  PROJECT_MUTATIONS,
} from "./github-projects";

describe("github-projects", () => {
  describe("mapCmuxStatusToProjectStatus", () => {
    it("maps pending to Backlog", () => {
      expect(mapCmuxStatusToProjectStatus("pending")).toBe("Backlog");
    });

    it("maps in_progress to In Progress", () => {
      expect(mapCmuxStatusToProjectStatus("in_progress")).toBe("In Progress");
    });

    it("maps completed to Done", () => {
      expect(mapCmuxStatusToProjectStatus("completed")).toBe("Done");
    });

    it("maps failed to Done (completed from workflow perspective)", () => {
      expect(mapCmuxStatusToProjectStatus("failed")).toBe("Done");
    });

    it("returns Backlog for unknown status", () => {
      // @ts-expect-error Testing invalid input
      expect(mapCmuxStatusToProjectStatus("unknown")).toBe("Backlog");
    });
  });

  describe("mapProjectStatusToCmux", () => {
    describe("maps to pending", () => {
      it("maps Backlog to pending", () => {
        expect(mapProjectStatusToCmux("Backlog")).toBe("pending");
      });

      it("maps Todo to pending", () => {
        expect(mapProjectStatusToCmux("Todo")).toBe("pending");
      });

      it("maps Planned to pending", () => {
        expect(mapProjectStatusToCmux("Planned")).toBe("pending");
      });
    });

    describe("maps to in_progress", () => {
      it("maps In Progress to in_progress", () => {
        expect(mapProjectStatusToCmux("In Progress")).toBe("in_progress");
      });

      it("maps Review to in_progress", () => {
        expect(mapProjectStatusToCmux("Review")).toBe("in_progress");
      });

      it("maps In Review to in_progress", () => {
        expect(mapProjectStatusToCmux("In Review")).toBe("in_progress");
      });
    });

    describe("maps to completed", () => {
      it("maps Done to completed", () => {
        expect(mapProjectStatusToCmux("Done")).toBe("completed");
      });

      it("maps Merged to completed", () => {
        expect(mapProjectStatusToCmux("Merged")).toBe("completed");
      });

      it("maps Closed to completed", () => {
        expect(mapProjectStatusToCmux("Closed")).toBe("completed");
      });
    });

    it("returns pending for unknown status", () => {
      expect(mapProjectStatusToCmux("Unknown Status")).toBe("pending");
    });

    it("is case-sensitive", () => {
      expect(mapProjectStatusToCmux("done")).toBe("pending"); // lowercase not recognized
      expect(mapProjectStatusToCmux("DONE")).toBe("pending"); // uppercase not recognized
    });
  });

  describe("PROJECT_QUERIES", () => {
    it("has getUserProjects query", () => {
      expect(PROJECT_QUERIES.getUserProjects).toContain("query");
      expect(PROJECT_QUERIES.getUserProjects).toContain("projectsV2");
    });

    it("has getOrgProjects query", () => {
      expect(PROJECT_QUERIES.getOrgProjects).toContain("organization");
      expect(PROJECT_QUERIES.getOrgProjects).toContain("projectsV2");
    });

    it("has getProjectFields query", () => {
      expect(PROJECT_QUERIES.getProjectFields).toContain("fields");
      expect(PROJECT_QUERIES.getProjectFields).toContain("ProjectV2Field");
    });

    it("has getProjectItems query", () => {
      expect(PROJECT_QUERIES.getProjectItems).toContain("items");
      expect(PROJECT_QUERIES.getProjectItems).toContain("fieldValues");
    });
  });

  describe("PROJECT_MUTATIONS", () => {
    it("has addItemToProject mutation", () => {
      expect(PROJECT_MUTATIONS.addItemToProject).toContain("mutation");
      expect(PROJECT_MUTATIONS.addItemToProject).toContain("addProjectV2ItemById");
    });

    it("has createDraftIssue mutation", () => {
      expect(PROJECT_MUTATIONS.createDraftIssue).toContain("mutation");
      expect(PROJECT_MUTATIONS.createDraftIssue).toContain("addProjectV2DraftIssue");
    });

    it("has updateItemFieldValue mutation", () => {
      expect(PROJECT_MUTATIONS.updateItemFieldValue).toContain("mutation");
      expect(PROJECT_MUTATIONS.updateItemFieldValue).toContain("updateProjectV2ItemFieldValue");
    });

    it("has updateProject mutation", () => {
      expect(PROJECT_MUTATIONS.updateProject).toContain("mutation");
      expect(PROJECT_MUTATIONS.updateProject).toContain("updateProjectV2");
    });

    it("has deleteItem mutation", () => {
      expect(PROJECT_MUTATIONS.deleteItem).toContain("mutation");
      expect(PROJECT_MUTATIONS.deleteItem).toContain("deleteProjectV2Item");
    });
  });
});
