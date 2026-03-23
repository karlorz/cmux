import { describe, expect, it } from "vitest";
import {
  classifyRisk,
  getRiskLevel,
  isAutoApprovable,
  requiresExplicitApproval,
  type RiskClassificationInput,
} from "./approval-risk-classifier";

describe("approval-risk-classifier", () => {
  describe("classifyRisk", () => {
    describe("high-risk patterns", () => {
      it("classifies git force push as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git push --force origin main",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("Force push");
      });

      it("classifies git push -f as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git push -f origin feature",
        });
        expect(result.level).toBe("high");
      });

      it("classifies git reset --hard as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git reset --hard HEAD~1",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("Hard reset");
      });

      it("classifies rm -rf as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "rm -rf ./node_modules",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("Recursive delete");
      });

      it("classifies gh pr create as high risk for task sandboxes", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "gh pr create --title 'Test'",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("PR lifecycle");
      });

      it("classifies gh pr merge as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "gh pr merge 123 --squash",
        });
        expect(result.level).toBe("high");
      });

      it("classifies devsh start as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "devsh start -p pve-lxc",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("Sandbox lifecycle");
      });

      it("classifies cloudrouter delete as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "cloudrouter delete sandbox-123",
        });
        expect(result.level).toBe("high");
      });

      it("classifies sudo commands as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "sudo apt-get install something",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("Elevated privileges");
      });

      it("classifies DROP TABLE as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "psql -c 'DROP TABLE users;'",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("DROP");
      });

      it("classifies gh workflow run as high risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "gh workflow run 'Build' --ref main",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("Workflow triggers");
      });
    });

    describe("low-risk patterns", () => {
      it("classifies cat as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "cat README.md",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("Read-only");
      });

      it("classifies ls as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "ls -la",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("Directory listing");
      });

      it("classifies git status as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git status",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("Git read");
      });

      it("classifies git log as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git log --oneline -10",
        });
        expect(result.level).toBe("low");
      });

      it("classifies git diff as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git diff HEAD~1",
        });
        expect(result.level).toBe("low");
      });

      it("classifies gh pr list as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "gh pr list --state open",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("GitHub read");
      });

      it("classifies grep as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "grep -r 'TODO' src/",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("Search");
      });

      it("classifies npm list as low risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "npm list --depth=0",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("Package read");
      });
    });

    describe("medium-risk patterns (default)", () => {
      it("classifies git commit as medium risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git commit -m 'feat: add feature'",
        });
        expect(result.level).toBe("medium");
      });

      it("classifies git push (non-force) as medium risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git push origin feature-branch",
        });
        expect(result.level).toBe("medium");
      });

      it("classifies npm install as medium risk", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "npm install lodash",
        });
        expect(result.level).toBe("medium");
      });
    });

    describe("tool-level classification", () => {
      it("classifies Read tool as low risk", () => {
        const result = classifyRisk({
          toolName: "Read",
          input: "/path/to/file.ts",
        });
        expect(result.level).toBe("low");
        expect(result.reason).toContain("read-only");
      });

      it("classifies Glob tool as low risk", () => {
        const result = classifyRisk({
          toolName: "Glob",
          input: "**/*.ts",
        });
        expect(result.level).toBe("low");
      });

      it("classifies Grep tool as low risk", () => {
        const result = classifyRisk({
          toolName: "Grep",
          input: "pattern",
        });
        expect(result.level).toBe("low");
      });

      it("classifies Write tool as medium risk", () => {
        const result = classifyRisk({
          toolName: "Write",
          input: "/path/to/file.ts",
        });
        expect(result.level).toBe("medium");
        expect(result.reason).toContain("File modification");
      });

      it("classifies Edit tool as medium risk", () => {
        const result = classifyRisk({
          toolName: "Edit",
          input: "old_string -> new_string",
        });
        expect(result.level).toBe("medium");
      });

      it("classifies WebFetch as high risk", () => {
        const result = classifyRisk({
          toolName: "WebFetch",
          input: "https://example.com",
        });
        expect(result.level).toBe("high");
        expect(result.reason).toContain("external network");
      });
    });

    describe("head agent behavior", () => {
      it("allows head agents to use gh pr create", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "gh pr create --title 'Test'",
          isHeadAgent: true,
        });
        expect(result.level).toBe("medium");
        expect(result.reason).toContain("Head agent");
      });

      it("allows head agents to use devsh commands", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "devsh start -p pve-lxc",
          isHeadAgent: true,
        });
        expect(result.level).toBe("medium");
      });

      it("still flags truly destructive ops for head agents", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "git push --force origin main",
          isHeadAgent: true,
        });
        expect(result.level).toBe("high");
      });

      it("still flags rm -rf for head agents", () => {
        const result = classifyRisk({
          toolName: "Bash",
          input: "rm -rf /",
          isHeadAgent: true,
        });
        expect(result.level).toBe("high");
      });
    });
  });

  describe("getRiskLevel", () => {
    it("returns just the level string", () => {
      expect(getRiskLevel({ toolName: "Bash", input: "ls -la" })).toBe("low");
      expect(getRiskLevel({ toolName: "Bash", input: "git commit -m 'test'" })).toBe("medium");
      expect(getRiskLevel({ toolName: "Bash", input: "rm -rf /" })).toBe("high");
    });
  });

  describe("isAutoApprovable", () => {
    it("returns true for low-risk operations", () => {
      expect(isAutoApprovable({ toolName: "Bash", input: "cat README.md" })).toBe(true);
      expect(isAutoApprovable({ toolName: "Read", input: "/path/file" })).toBe(true);
    });

    it("returns false for medium and high-risk operations", () => {
      expect(isAutoApprovable({ toolName: "Bash", input: "git commit -m 'test'" })).toBe(false);
      expect(isAutoApprovable({ toolName: "Bash", input: "rm -rf /" })).toBe(false);
    });
  });

  describe("requiresExplicitApproval", () => {
    it("returns true for high-risk operations", () => {
      expect(requiresExplicitApproval({ toolName: "Bash", input: "rm -rf /" })).toBe(true);
      expect(requiresExplicitApproval({ toolName: "Bash", input: "git push --force" })).toBe(true);
    });

    it("returns false for low and medium-risk operations", () => {
      expect(requiresExplicitApproval({ toolName: "Bash", input: "cat README.md" })).toBe(false);
      expect(requiresExplicitApproval({ toolName: "Bash", input: "git commit -m 'test'" })).toBe(false);
    });
  });
});
