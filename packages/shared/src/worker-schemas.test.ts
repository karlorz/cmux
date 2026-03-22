import { describe, expect, it } from "vitest";
import {
  AuthFileSchema,
  PostStartCommandSchema,
  PtyMetadataSchema,
  WorkerRegisterSchema,
  WorkerHeartbeatSchema,
  WorkerStatusSchema,
  WorkerCreateTerminalSchema,
  WorkerTerminalInputSchema,
  WorkerResizeTerminalSchema,
  WorkerCloseTerminalSchema,
  WorkerUploadFileSchema,
  WorkerExecSchema,
  WorkerExecResultSchema,
  WorkerSyncFileSchema,
} from "./worker-schemas";

describe("worker-schemas", () => {
  describe("AuthFileSchema", () => {
    it("accepts valid auth file", () => {
      const result = AuthFileSchema.safeParse({
        destinationPath: "/home/user/.ssh/id_rsa",
        contentBase64: "c29tZS1jb250ZW50",
        mode: "600",
      });
      expect(result.success).toBe(true);
    });

    it("accepts auth file without mode", () => {
      const result = AuthFileSchema.safeParse({
        destinationPath: "/path/to/file",
        contentBase64: "YmFzZTY0",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing destinationPath", () => {
      const result = AuthFileSchema.safeParse({
        contentBase64: "YmFzZTY0",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing contentBase64", () => {
      const result = AuthFileSchema.safeParse({
        destinationPath: "/path/to/file",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("PostStartCommandSchema", () => {
    it("accepts valid post-start command", () => {
      const result = PostStartCommandSchema.safeParse({
        description: "Install dependencies",
        command: "npm install",
        timeoutMs: 60000,
        continueOnError: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal post-start command", () => {
      const result = PostStartCommandSchema.safeParse({
        description: "Run script",
        command: "./script.sh",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing description", () => {
      const result = PostStartCommandSchema.safeParse({
        command: "npm install",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("PtyMetadataSchema", () => {
    it("accepts valid pty metadata", () => {
      const result = PtyMetadataSchema.safeParse({
        location: "editor",
        type: "agent",
        managed: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty object (all fields optional)", () => {
      const result = PtyMetadataSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid location", () => {
      const result = PtyMetadataSchema.safeParse({
        location: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid type", () => {
      const result = PtyMetadataSchema.safeParse({
        type: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("accepts all valid location values", () => {
      expect(PtyMetadataSchema.safeParse({ location: "editor" }).success).toBe(true);
      expect(PtyMetadataSchema.safeParse({ location: "panel" }).success).toBe(true);
    });

    it("accepts all valid type values", () => {
      expect(PtyMetadataSchema.safeParse({ type: "agent" }).success).toBe(true);
      expect(PtyMetadataSchema.safeParse({ type: "dev" }).success).toBe(true);
      expect(PtyMetadataSchema.safeParse({ type: "maintenance" }).success).toBe(true);
      expect(PtyMetadataSchema.safeParse({ type: "shell" }).success).toBe(true);
    });
  });

  describe("WorkerRegisterSchema", () => {
    it("accepts valid worker registration", () => {
      const result = WorkerRegisterSchema.safeParse({
        workerId: "worker-123",
        capabilities: {
          maxConcurrentTerminals: 4,
          memoryMB: 8192,
          cpuCores: 4,
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts full registration with all optional fields", () => {
      const result = WorkerRegisterSchema.safeParse({
        workerId: "worker-456",
        capabilities: {
          maxConcurrentTerminals: 8,
          supportedLanguages: ["typescript", "python"],
          gpuAvailable: true,
          memoryMB: 16384,
          cpuCores: 8,
        },
        containerInfo: {
          image: "cmux/worker:latest",
          version: "1.0.0",
          platform: "linux/amd64",
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects zero or negative maxConcurrentTerminals", () => {
      const result = WorkerRegisterSchema.safeParse({
        workerId: "worker-123",
        capabilities: {
          maxConcurrentTerminals: 0,
          memoryMB: 8192,
          cpuCores: 4,
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing required capabilities", () => {
      const result = WorkerRegisterSchema.safeParse({
        workerId: "worker-123",
        capabilities: {
          maxConcurrentTerminals: 4,
          // missing memoryMB and cpuCores
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerHeartbeatSchema", () => {
    it("accepts valid heartbeat", () => {
      const result = WorkerHeartbeatSchema.safeParse({
        workerId: "worker-123",
        timestamp: Date.now(),
        stats: {
          cpuUsage: 45.5,
          memoryUsage: 60.2,
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects cpuUsage > 100", () => {
      const result = WorkerHeartbeatSchema.safeParse({
        workerId: "worker-123",
        timestamp: Date.now(),
        stats: {
          cpuUsage: 150,
          memoryUsage: 50,
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative memoryUsage", () => {
      const result = WorkerHeartbeatSchema.safeParse({
        workerId: "worker-123",
        timestamp: Date.now(),
        stats: {
          cpuUsage: 50,
          memoryUsage: -10,
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerStatusSchema", () => {
    it("accepts valid status", () => {
      const result = WorkerStatusSchema.safeParse({
        workerId: "worker-123",
        status: "online",
        lastSeen: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it("accepts all valid status values", () => {
      const statuses = ["online", "offline", "busy", "error"];
      for (const status of statuses) {
        const result = WorkerStatusSchema.safeParse({
          workerId: "worker-123",
          status,
          lastSeen: Date.now(),
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects invalid status value", () => {
      const result = WorkerStatusSchema.safeParse({
        workerId: "worker-123",
        status: "unknown",
        lastSeen: Date.now(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerCreateTerminalSchema", () => {
    it("accepts minimal valid terminal creation", () => {
      const result = WorkerCreateTerminalSchema.safeParse({
        terminalId: "term-123",
        taskRunContext: {
          taskRunToken: "token-abc",
          prompt: "Fix the bug",
          convexUrl: "https://convex.dev",
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // Check defaults
        expect(result.data.cols).toBe(80);
        expect(result.data.rows).toBe(24);
        expect(result.data.backend).toBe("tmux");
      }
    });

    it("accepts full terminal creation with all options", () => {
      const result = WorkerCreateTerminalSchema.safeParse({
        terminalId: "term-456",
        cols: 120,
        rows: 40,
        cwd: "/workspace",
        env: { NODE_ENV: "development" },
        taskRunContext: {
          taskRunToken: "token-xyz",
          prompt: "Implement feature",
          convexUrl: "https://convex.dev",
          isPreviewJob: true,
        },
        command: "claude",
        args: ["--model", "opus"],
        agentModel: "claude/opus-4.5",
        backend: "cmux-pty",
        ptyCommand: "/bin/bash",
        ptyArgs: ["-l"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects zero or negative cols/rows", () => {
      const result = WorkerCreateTerminalSchema.safeParse({
        terminalId: "term-123",
        cols: 0,
        rows: -1,
        taskRunContext: {
          taskRunToken: "token",
          prompt: "test",
          convexUrl: "https://convex.dev",
        },
      });
      expect(result.success).toBe(false);
    });

    it("accepts both backend types", () => {
      const tmux = WorkerCreateTerminalSchema.safeParse({
        terminalId: "term-1",
        backend: "tmux",
        taskRunContext: {
          taskRunToken: "token",
          prompt: "test",
          convexUrl: "https://convex.dev",
        },
      });
      const cmuxPty = WorkerCreateTerminalSchema.safeParse({
        terminalId: "term-2",
        backend: "cmux-pty",
        taskRunContext: {
          taskRunToken: "token",
          prompt: "test",
          convexUrl: "https://convex.dev",
        },
      });
      expect(tmux.success).toBe(true);
      expect(cmuxPty.success).toBe(true);
    });
  });

  describe("WorkerTerminalInputSchema", () => {
    it("accepts valid terminal input", () => {
      const result = WorkerTerminalInputSchema.safeParse({
        terminalId: "term-123",
        data: "ls -la\n",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty data", () => {
      const result = WorkerTerminalInputSchema.safeParse({
        terminalId: "term-123",
        data: "",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("WorkerResizeTerminalSchema", () => {
    it("accepts valid resize", () => {
      const result = WorkerResizeTerminalSchema.safeParse({
        terminalId: "term-123",
        cols: 120,
        rows: 40,
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-positive dimensions", () => {
      const result = WorkerResizeTerminalSchema.safeParse({
        terminalId: "term-123",
        cols: 0,
        rows: 40,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerCloseTerminalSchema", () => {
    it("accepts valid close request", () => {
      const result = WorkerCloseTerminalSchema.safeParse({
        terminalId: "term-123",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("WorkerUploadFileSchema", () => {
    it("accepts valid write action", () => {
      const result = WorkerUploadFileSchema.safeParse({
        destinationPath: "/workspace/file.txt",
        action: "write",
        contentBase64: "aGVsbG8gd29ybGQ=",
        mode: "644",
      });
      expect(result.success).toBe(true);
    });

    it("accepts delete action without contentBase64", () => {
      const result = WorkerUploadFileSchema.safeParse({
        destinationPath: "/workspace/file.txt",
        action: "delete",
      });
      expect(result.success).toBe(true);
    });

    it("rejects write action without contentBase64", () => {
      const result = WorkerUploadFileSchema.safeParse({
        destinationPath: "/workspace/file.txt",
        action: "write",
      });
      expect(result.success).toBe(false);
    });

    it("accepts implicit write action (default) with contentBase64", () => {
      const result = WorkerUploadFileSchema.safeParse({
        destinationPath: "/workspace/file.txt",
        contentBase64: "Y29udGVudA==",
      });
      expect(result.success).toBe(true);
    });

    it("rejects implicit write action without contentBase64", () => {
      const result = WorkerUploadFileSchema.safeParse({
        destinationPath: "/workspace/file.txt",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("WorkerExecSchema", () => {
    it("accepts minimal exec command", () => {
      const result = WorkerExecSchema.safeParse({
        command: "ls",
      });
      expect(result.success).toBe(true);
    });

    it("accepts full exec command", () => {
      const result = WorkerExecSchema.safeParse({
        command: "npm",
        args: ["install", "--save", "express"],
        cwd: "/workspace",
        env: { NODE_ENV: "production" },
        timeout: 30000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("WorkerExecResultSchema", () => {
    it("accepts valid exec result", () => {
      const result = WorkerExecResultSchema.safeParse({
        stdout: "file.txt\n",
        stderr: "",
        exitCode: 0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts exec result with signal", () => {
      const result = WorkerExecResultSchema.safeParse({
        stdout: "",
        stderr: "Terminated",
        exitCode: 137,
        signal: "SIGKILL",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("WorkerSyncFileSchema", () => {
    it("accepts valid write sync", () => {
      const result = WorkerSyncFileSchema.safeParse({
        relativePath: "src/index.ts",
        action: "write",
        contentBase64: "Y29uc3QgeCA9IDE7",
        mode: "644",
      });
      expect(result.success).toBe(true);
    });

    it("accepts delete sync without content", () => {
      const result = WorkerSyncFileSchema.safeParse({
        relativePath: "src/old-file.ts",
        action: "delete",
      });
      expect(result.success).toBe(true);
    });

    it("accepts write sync without mode", () => {
      const result = WorkerSyncFileSchema.safeParse({
        relativePath: "README.md",
        action: "write",
        contentBase64: "IyBSRUFETUU=",
      });
      expect(result.success).toBe(true);
    });
  });
});
