import { describe, expect, it, beforeEach, mock } from "bun:test";
import {
  E2BClient,
  E2BInstance,
  DEFAULT_E2B_BASE_URL,
  CMUX_DEVBOX_TEMPLATE_ID,
  type E2BHttpService,
  type E2BMetadata,
} from "./index";

// Mock the E2B SDK Sandbox class
const mockSandbox = {
  sandboxId: "test-sandbox-123",
  commands: {
    run: mock(() =>
      Promise.resolve({ stdout: "output", stderr: "", exitCode: 0 })
    ),
  },
  files: {
    write: mock(() => Promise.resolve()),
    read: mock(() => Promise.resolve("file content")),
  },
  getHost: (port: number) => `test-sandbox-123-${port}.e2b.dev`,
  setTimeout: mock(() => Promise.resolve()),
  kill: mock(() => Promise.resolve()),
  betaPause: mock(() => Promise.resolve(true)),
  isRunning: mock(() => Promise.resolve(true)),
};

describe("E2BClient", () => {
  describe("constructor", () => {
    it("should throw error when API key is not provided", () => {
      const originalEnv = process.env.E2B_API_KEY;
      delete process.env.E2B_API_KEY;

      expect(() => new E2BClient({})).toThrow("E2B API key is required");

      process.env.E2B_API_KEY = originalEnv;
    });

    it("should accept API key from config", () => {
      const client = new E2BClient({ apiKey: "test-api-key" });
      expect(client).toBeDefined();
    });

    it("should accept API key from environment", () => {
      const originalEnv = process.env.E2B_API_KEY;
      process.env.E2B_API_KEY = "env-api-key";

      const client = new E2BClient({});
      expect(client).toBeDefined();

      process.env.E2B_API_KEY = originalEnv;
    });
  });
});

describe("E2BInstance", () => {
  let instance: E2BInstance;
  const testMetadata: E2BMetadata = { key: "value" };
  const testHttpServices: E2BHttpService[] = [
    { name: "vscode", port: 39378, url: "https://test.e2b.dev:39378" },
    { name: "worker", port: 39377, url: "https://test.e2b.dev:39377" },
  ];

  beforeEach(() => {
    // Reset mocks
    mockSandbox.commands.run.mockClear();
    mockSandbox.files.write.mockClear();
    mockSandbox.files.read.mockClear();
    mockSandbox.setTimeout.mockClear();
    mockSandbox.kill.mockClear();
    mockSandbox.betaPause.mockClear();

    instance = new E2BInstance(
      mockSandbox as unknown as Parameters<typeof E2BInstance>[0],
      testMetadata,
      testHttpServices
    );
  });

  describe("properties", () => {
    it("should return the sandbox ID", () => {
      expect(instance.id).toBe("test-sandbox-123");
    });

    it("should return metadata", () => {
      expect(instance.metadata).toEqual(testMetadata);
    });

    it("should return status as running", () => {
      expect(instance.status).toBe("running");
    });

    it("should return networking with http services", () => {
      expect(instance.networking.httpServices).toEqual(testHttpServices);
    });
  });

  describe("exec", () => {
    it("should execute a command successfully", async () => {
      const result = await instance.exec("echo hello");
      expect(result).toEqual({
        stdout: "output",
        stderr: "",
        exit_code: 0,
      });
      expect(mockSandbox.commands.run).toHaveBeenCalledWith("echo hello");
    });

    it("should handle non-zero exit codes gracefully", async () => {
      mockSandbox.commands.run.mockImplementationOnce(() =>
        Promise.resolve({ stdout: "", stderr: "error", exitCode: 1 })
      );

      const result = await instance.exec("failing-command");
      expect(result.exit_code).toBe(1);
      expect(result.stderr).toBe("error");
    });

    it("should handle CommandExitError", async () => {
      // Simulate CommandExitError
      const error = Object.assign(new Error("command failed"), {
        stdout: "partial output",
        stderr: "error message",
        exitCode: 127,
      });

      mockSandbox.commands.run.mockImplementationOnce(() => Promise.reject(error));

      const result = await instance.exec("bad-command");
      expect(result.exit_code).toBe(127);
      expect(result.stdout).toBe("partial output");
      expect(result.stderr).toBe("error message");
    });

    it("should handle generic errors", async () => {
      mockSandbox.commands.run.mockImplementationOnce(() =>
        Promise.reject(new Error("network error"))
      );

      const result = await instance.exec("command");
      expect(result.exit_code).toBe(1);
      expect(result.stderr).toBe("network error");
    });
  });

  describe("getHost", () => {
    it("should return the host URL for a port", () => {
      const host = instance.getHost(8080);
      expect(host).toBe("test-sandbox-123-8080.e2b.dev");
    });
  });

  describe("exposeHttpService", () => {
    it("should add a new HTTP service", async () => {
      await instance.exposeHttpService("custom", 9000);
      const services = instance.networking.httpServices;
      expect(services).toContainEqual({
        name: "custom",
        port: 9000,
        url: "https://test-sandbox-123-9000.e2b.dev",
      });
    });
  });

  describe("hideHttpService", () => {
    it("should remove an HTTP service by name", async () => {
      await instance.hideHttpService("vscode");
      const services = instance.networking.httpServices;
      expect(services.find((s) => s.name === "vscode")).toBeUndefined();
    });
  });

  describe("setTimeout", () => {
    it("should call sandbox setTimeout", async () => {
      await instance.setTimeout(120000);
      expect(mockSandbox.setTimeout).toHaveBeenCalledWith(120000);
    });
  });

  describe("stop", () => {
    it("should kill the sandbox and update status", async () => {
      await instance.stop();
      expect(mockSandbox.kill).toHaveBeenCalled();
      expect(instance.status).toBe("stopped");
    });
  });

  describe("pause", () => {
    it("should pause the sandbox and update status", async () => {
      const result = await instance.pause();
      expect(result).toBe(true);
      expect(mockSandbox.betaPause).toHaveBeenCalled();
      expect(instance.status).toBe("paused");
    });
  });

  describe("file operations", () => {
    it("should write a file", async () => {
      await instance.writeFile("/test/path.txt", "content");
      expect(mockSandbox.files.write).toHaveBeenCalledWith(
        "/test/path.txt",
        "content"
      );
    });

    it("should read a file", async () => {
      const content = await instance.readFile("/test/path.txt");
      expect(content).toBe("file content");
      expect(mockSandbox.files.read).toHaveBeenCalledWith("/test/path.txt");
    });
  });

  describe("getSandbox", () => {
    it("should return the underlying sandbox", () => {
      expect(instance.getSandbox()).toBe(mockSandbox);
    });
  });

  describe("setWakeOn", () => {
    it("should be a no-op (E2B does not support wake-on)", async () => {
      // Should not throw
      await instance.setWakeOn(true, true);
    });
  });
});

describe("Constants", () => {
  it("should export DEFAULT_E2B_BASE_URL", () => {
    expect(DEFAULT_E2B_BASE_URL).toBe("https://api.e2b.dev");
  });

  it("should export CMUX_DEVBOX_TEMPLATE_ID", () => {
    expect(CMUX_DEVBOX_TEMPLATE_ID).toBeDefined();
    expect(typeof CMUX_DEVBOX_TEMPLATE_ID).toBe("string");
  });
});
