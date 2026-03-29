import { describe, expect, it } from "vitest";
import {
  CreateTerminalSchema,
  TerminalInputSchema,
  ResizeSchema,
  CloseTerminalSchema,
  StartTaskSchema,
  CreateLocalWorkspaceSchema,
  CreateCloudWorkspaceSchema,
  AuthenticateSchema,
  TerminalCreatedSchema,
  TerminalOutputSchema,
  TerminalExitSchema,
  TerminalClosedSchema,
  GitFileSchema,
  DiffLineSchema,
  GitStatusResponseSchema,
  OpenInEditorSchema,
  ListFilesRequestSchema,
  FileInfoSchema,
  ListFilesResponseSchema,
  VSCodeSpawnedSchema,
  GitHubBranchSchema,
  ProviderStatusSchema,
  DockerStatusSchema,
  DockerPullProgressSchema,
  DefaultRepoSchema,
} from "./socket-schemas";

describe("socket-schemas", () => {
  describe("CreateTerminalSchema", () => {
    it("accepts valid terminal creation", () => {
      const result = CreateTerminalSchema.safeParse({
        cols: 120,
        rows: 40,
      });
      expect(result.success).toBe(true);
    });

    it("applies default values", () => {
      const result = CreateTerminalSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cols).toBe(80);
        expect(result.data.rows).toBe(24);
      }
    });

    it("rejects non-positive cols", () => {
      const result = CreateTerminalSchema.safeParse({
        cols: 0,
        rows: 24,
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional id", () => {
      const result = CreateTerminalSchema.safeParse({
        id: "term-123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("term-123");
      }
    });
  });

  describe("TerminalInputSchema", () => {
    it("accepts valid input", () => {
      const result = TerminalInputSchema.safeParse({
        terminalId: "term-123",
        data: "ls -la\n",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing terminalId", () => {
      const result = TerminalInputSchema.safeParse({
        data: "ls -la\n",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ResizeSchema", () => {
    it("accepts valid resize", () => {
      const result = ResizeSchema.safeParse({
        terminalId: "term-123",
        cols: 200,
        rows: 50,
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-positive dimensions", () => {
      const result = ResizeSchema.safeParse({
        terminalId: "term-123",
        cols: -1,
        rows: 50,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CloseTerminalSchema", () => {
    it("accepts valid close", () => {
      const result = CloseTerminalSchema.safeParse({
        terminalId: "term-123",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("StartTaskSchema", () => {
    it("accepts valid task start", () => {
      const result = StartTaskSchema.safeParse({
        taskDescription: "Fix the bug in auth module",
        projectFullName: "org/repo",
        taskId: "k573abc123def456ghi789jkl",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isCloudMode).toBe(false);
      }
    });

    it("accepts full task with all options", () => {
      const result = StartTaskSchema.safeParse({
        repoUrl: "https://github.com/org/repo",
        branch: "feature-branch",
        taskDescription: "Implement feature",
        projectFullName: "org/repo",
        taskId: "k573abc123def456ghi789jkl",
        selectedAgentSelections: [
          {
            agentName: "claude/opus-4.5",
            selectedVariant: "medium",
          },
          {
            agentName: "codex/gpt-5.1-codex-mini",
          },
        ],
        selectedAgents: ["claude/opus-4.5", "codex/gpt-5.1-codex-mini"],
        isCloudMode: true,
        images: [
          {
            src: "data:image/png;base64,abc",
            fileName: "screenshot.png",
            altText: "Screenshot of bug",
          },
        ],
        theme: "dark",
        ralphMode: {
          enabled: true,
          maxIterations: 100,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ralphMode?.enabled).toBe(true);
        expect(result.data.ralphMode?.maxIterations).toBe(100);
        expect(result.data.ralphMode?.completionTag).toBe("DONE");
        expect(result.data.selectedAgentSelections?.[0]?.selectedVariant).toBe(
          "medium",
        );
      }
    });

    it("rejects missing required fields", () => {
      const result = StartTaskSchema.safeParse({
        taskDescription: "Fix the bug",
        // missing projectFullName and taskId
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid theme values", () => {
      const themes = ["dark", "light", "system"] as const;
      for (const theme of themes) {
        const result = StartTaskSchema.safeParse({
          taskDescription: "Test",
          projectFullName: "org/repo",
          taskId: "k573abc123def456ghi789jkl",
          theme,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("CreateLocalWorkspaceSchema", () => {
    it("accepts valid local workspace", () => {
      const result = CreateLocalWorkspaceSchema.safeParse({
        teamSlugOrId: "team-123",
        projectFullName: "org/repo",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full workspace with all options", () => {
      const result = CreateLocalWorkspaceSchema.safeParse({
        teamSlugOrId: "team-123",
        projectFullName: "org/repo",
        repoUrl: "https://github.com/org/repo",
        branch: "feature",
        baseBranch: "main",
        workspaceName: "my-workspace",
        descriptor: "bug-fix",
        sequence: 1,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CreateCloudWorkspaceSchema", () => {
    it("accepts workspace with environmentId", () => {
      const result = CreateCloudWorkspaceSchema.safeParse({
        teamSlugOrId: "team-123",
        environmentId: "k57hmn7abc123def456ghi789",
      });
      expect(result.success).toBe(true);
    });

    it("accepts workspace with projectFullName", () => {
      const result = CreateCloudWorkspaceSchema.safeParse({
        teamSlugOrId: "team-123",
        projectFullName: "org/repo",
      });
      expect(result.success).toBe(true);
    });

    it("rejects workspace without environmentId or projectFullName", () => {
      const result = CreateCloudWorkspaceSchema.safeParse({
        teamSlugOrId: "team-123",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("AuthenticateSchema", () => {
    it("accepts valid authentication", () => {
      const result = AuthenticateSchema.safeParse({
        authToken: "token-123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional authJson", () => {
      const result = AuthenticateSchema.safeParse({
        authToken: "token-123",
        authJson: JSON.stringify({ user: "test" }),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("TerminalCreatedSchema", () => {
    it("accepts valid terminal created event", () => {
      const result = TerminalCreatedSchema.safeParse({
        terminalId: "term-123",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("TerminalOutputSchema", () => {
    it("accepts valid terminal output", () => {
      const result = TerminalOutputSchema.safeParse({
        terminalId: "term-123",
        data: "Hello, World!\n",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("TerminalExitSchema", () => {
    it("accepts exit with code only", () => {
      const result = TerminalExitSchema.safeParse({
        terminalId: "term-123",
        exitCode: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts exit with signal", () => {
      const result = TerminalExitSchema.safeParse({
        terminalId: "term-123",
        exitCode: 137,
        signal: 9,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("TerminalClosedSchema", () => {
    it("accepts valid terminal closed event", () => {
      const result = TerminalClosedSchema.safeParse({
        terminalId: "term-123",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("GitFileSchema", () => {
    it("accepts valid git file", () => {
      const result = GitFileSchema.safeParse({
        path: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 5,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all status values", () => {
      const statuses = ["added", "modified", "deleted", "renamed"] as const;
      for (const status of statuses) {
        const result = GitFileSchema.safeParse({
          path: "file.ts",
          status,
          additions: 0,
          deletions: 0,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid status", () => {
      const result = GitFileSchema.safeParse({
        path: "file.ts",
        status: "unknown",
        additions: 0,
        deletions: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DiffLineSchema", () => {
    it("accepts valid diff line types", () => {
      const types = ["addition", "deletion", "context", "header"] as const;
      for (const type of types) {
        const result = DiffLineSchema.safeParse({
          type,
          content: "+const x = 1;",
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts diff line with line numbers", () => {
      const result = DiffLineSchema.safeParse({
        type: "addition",
        content: "+const x = 1;",
        lineNumber: {
          old: 10,
          new: 11,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("GitStatusResponseSchema", () => {
    it("accepts valid status response", () => {
      const result = GitStatusResponseSchema.safeParse({
        files: [
          {
            path: "src/index.ts",
            status: "modified",
            additions: 5,
            deletions: 2,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts status response with error", () => {
      const result = GitStatusResponseSchema.safeParse({
        files: [],
        error: "Repository not found",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("OpenInEditorSchema", () => {
    it("accepts all valid editor values", () => {
      const editors = [
        "vscode",
        "cursor",
        "windsurf",
        "finder",
        "iterm",
        "terminal",
        "ghostty",
        "alacritty",
        "xcode",
      ] as const;
      for (const editor of editors) {
        const result = OpenInEditorSchema.safeParse({
          editor,
          path: "/path/to/file",
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid editor", () => {
      const result = OpenInEditorSchema.safeParse({
        editor: "notepad",
        path: "/path/to/file",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ListFilesRequestSchema", () => {
    it("accepts request with repoPath", () => {
      const result = ListFilesRequestSchema.safeParse({
        repoPath: "/path/to/repo",
      });
      expect(result.success).toBe(true);
    });

    it("accepts request with environmentId", () => {
      const result = ListFilesRequestSchema.safeParse({
        environmentId: "k57hmn7abc123def456ghi789",
      });
      expect(result.success).toBe(true);
    });

    it("rejects request without repoPath or environmentId", () => {
      const result = ListFilesRequestSchema.safeParse({
        branch: "main",
      });
      expect(result.success).toBe(false);
    });

    it("accepts request with optional pattern", () => {
      const result = ListFilesRequestSchema.safeParse({
        repoPath: "/path/to/repo",
        pattern: "**/*.ts",
        branch: "feature",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("FileInfoSchema", () => {
    it("accepts valid file info", () => {
      const result = FileInfoSchema.safeParse({
        path: "/workspace/src/index.ts",
        name: "index.ts",
        isDirectory: false,
        relativePath: "src/index.ts",
      });
      expect(result.success).toBe(true);
    });

    it("accepts file info with repoFullName", () => {
      const result = FileInfoSchema.safeParse({
        path: "/workspace/src",
        name: "src",
        isDirectory: true,
        relativePath: "src",
        repoFullName: "org/repo",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ListFilesResponseSchema", () => {
    it("accepts successful response", () => {
      const result = ListFilesResponseSchema.safeParse({
        ok: true,
        files: [
          {
            path: "/workspace/file.ts",
            name: "file.ts",
            isDirectory: false,
            relativePath: "file.ts",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts error response", () => {
      const result = ListFilesResponseSchema.safeParse({
        ok: false,
        files: [],
        error: "Access denied",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("VSCodeSpawnedSchema", () => {
    it("accepts valid vscode spawned event", () => {
      const result = VSCodeSpawnedSchema.safeParse({
        instanceId: "morphvm_abc123",
        url: "https://vscode.example.com",
        workspaceUrl: "https://workspace.example.com",
        provider: "morph",
      });
      expect(result.success).toBe(true);
    });

    it("accepts event with optional urls", () => {
      const result = VSCodeSpawnedSchema.safeParse({
        instanceId: "lxc_123",
        url: "https://vscode.example.com",
        workspaceUrl: "https://workspace.example.com",
        vncUrl: "https://vnc.example.com",
        xtermUrl: "https://xterm.example.com",
        provider: "pve-lxc",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all valid provider values", () => {
      const providers = [
        "docker",
        "morph",
        "e2b",
        "daytona",
        "pve-lxc",
        "other",
      ] as const;
      for (const provider of providers) {
        const result = VSCodeSpawnedSchema.safeParse({
          instanceId: "instance-123",
          url: "https://example.com",
          workspaceUrl: "https://workspace.example.com",
          provider,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("GitHubBranchSchema", () => {
    it("accepts minimal branch", () => {
      const result = GitHubBranchSchema.safeParse({
        name: "main",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full branch info", () => {
      const result = GitHubBranchSchema.safeParse({
        name: "feature-branch",
        lastCommitSha: "abc123def456",
        lastActivityAt: Date.now(),
        isDefault: false,
        lastKnownBaseSha: "def456abc123",
        lastKnownMergeCommitSha: "789xyz",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ProviderStatusSchema", () => {
    it("accepts available provider", () => {
      const result = ProviderStatusSchema.safeParse({
        name: "morph",
        isAvailable: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts unavailable provider with missing requirements", () => {
      const result = ProviderStatusSchema.safeParse({
        name: "docker",
        isAvailable: false,
        missingRequirements: ["Docker is not running", "Docker image not found"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("DockerStatusSchema", () => {
    it("accepts running docker", () => {
      const result = DockerStatusSchema.safeParse({
        isRunning: true,
        version: "24.0.7",
      });
      expect(result.success).toBe(true);
    });

    it("accepts docker with worker image info", () => {
      const result = DockerStatusSchema.safeParse({
        isRunning: true,
        version: "24.0.7",
        workerImage: {
          name: "cmux/worker:latest",
          isAvailable: true,
          isPulling: false,
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts not running docker with error", () => {
      const result = DockerStatusSchema.safeParse({
        isRunning: false,
        error: "Docker daemon not responding",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("DockerPullProgressSchema", () => {
    it("accepts pull progress event", () => {
      const result = DockerPullProgressSchema.safeParse({
        imageName: "cmux/worker:latest",
        status: "Downloading",
        progress: "50%",
        id: "abc123",
        current: 50000000,
        total: 100000000,
        percent: 50,
        phase: "pulling",
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal progress event", () => {
      const result = DockerPullProgressSchema.safeParse({
        imageName: "cmux/worker:latest",
        status: "Waiting",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all phase values", () => {
      const phases = ["waiting", "pulling", "complete", "error"] as const;
      for (const phase of phases) {
        const result = DockerPullProgressSchema.safeParse({
          imageName: "image:tag",
          status: "Status",
          phase,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("DefaultRepoSchema", () => {
    it("accepts valid default repo", () => {
      const result = DefaultRepoSchema.safeParse({
        repoFullName: "org/repo",
        localPath: "/home/user/projects/repo",
      });
      expect(result.success).toBe(true);
    });

    it("accepts default repo with branch", () => {
      const result = DefaultRepoSchema.safeParse({
        repoFullName: "org/repo",
        branch: "develop",
        localPath: "/home/user/projects/repo",
      });
      expect(result.success).toBe(true);
    });
  });
});
