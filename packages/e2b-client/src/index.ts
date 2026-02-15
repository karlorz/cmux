import { CommandExitError, Sandbox, type SandboxInfo } from "e2b";

export const DEFAULT_E2B_BASE_URL = "https://api.e2b.dev";

/**
 * Default template ID for cmux-lite (free tier compatible)
 */
export const CMUX_DEVBOX_TEMPLATE_ID = "af5awbnr42dc2na15tup"; // cmux-lite (2 vCPU / 512 MB)

/**
 * Configuration for creating an E2B client
 */
export interface E2BClientConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Result of executing a command in an E2B sandbox
 */
export interface E2BExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

/**
 * HTTP service exposed by an E2B sandbox
 */
export interface E2BHttpService {
  name: string;
  port: number;
  url: string;
}

/**
 * Networking information for an E2B sandbox
 */
export interface E2BNetworking {
  httpServices: E2BHttpService[];
}

/**
 * Metadata stored with an E2B sandbox
 */
export type E2BMetadata = Record<string, string>;

export type E2BSandboxState = "running" | "paused";

/**
 * Sandbox info returned by list/getInfo APIs.
 */
export interface E2BSandboxSummary {
  sandboxId: string;
  templateId: string;
  metadata: E2BMetadata;
  state: E2BSandboxState;
  startedAt: Date;
  endAt: Date;
}

export interface E2BListOptions {
  metadata?: E2BMetadata;
  state?: E2BSandboxState[];
  limit?: number;
}

/**
 * E2B Sandbox instance wrapper that provides a similar interface to MorphInstance
 */
export class E2BInstance {
  private sandbox: Sandbox;
  private _id: string;
  private _metadata: E2BMetadata;
  private _httpServices: E2BHttpService[];
  private _status: "running" | "paused" | "stopped";

  constructor(
    sandbox: Sandbox,
    metadata: E2BMetadata = {},
    httpServices: E2BHttpService[] = [],
    status: "running" | "paused" | "stopped" = "running"
  ) {
    this.sandbox = sandbox;
    this._id = sandbox.sandboxId;
    this._metadata = metadata;
    this._httpServices = httpServices;
    this._status = status;
  }

  get id(): string {
    return this._id;
  }

  get metadata(): E2BMetadata {
    return this._metadata;
  }

  get status(): "running" | "paused" | "stopped" {
    return this._status;
  }

  get networking(): E2BNetworking {
    return {
      httpServices: this._httpServices,
    };
  }

  /**
   * Execute a command in the sandbox
   * Handles non-zero exit codes gracefully (doesn't throw)
   */
  async exec(
    command: string,
    opts: { timeoutMs?: number } = {}
  ): Promise<E2BExecResult> {
    try {
      const result = await this.sandbox.commands.run(command, {
        timeoutMs: opts.timeoutMs,
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exitCode,
      };
    } catch (err: unknown) {
      if (err instanceof CommandExitError) {
        return {
          stdout: err.stdout,
          stderr: err.stderr,
          exit_code: err.exitCode,
        };
      }

      // Backward-compatible fallback if error shape changes.
      if (
        err &&
        typeof err === "object" &&
        "stdout" in err &&
        "stderr" in err &&
        "exitCode" in err
      ) {
        const cmdErr = err as {
          stdout: string;
          stderr: string;
          exitCode: number;
        };
        return {
          stdout: cmdErr.stdout || "",
          stderr: cmdErr.stderr || "",
          exit_code: cmdErr.exitCode,
        };
      }

      console.error("[E2BInstance.exec] Error:", err);
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exit_code: 1,
      };
    }
  }

  /**
   * Get the host URL for a specific port
   */
  getHost(port: number): string {
    return this.sandbox.getHost(port);
  }

  /**
   * Expose an HTTP service on a port
   */
  async exposeHttpService(name: string, port: number): Promise<void> {
    const url = `https://${this.getHost(port)}`;
    this._httpServices.push({ name, port, url });
  }

  /**
   * Hide/remove an exposed HTTP service
   */
  async hideHttpService(name: string): Promise<void> {
    this._httpServices = this._httpServices.filter((s) => s.name !== name);
  }

  /**
   * Set sandbox timeout
   */
  async setTimeout(timeoutMs: number): Promise<void> {
    await this.sandbox.setTimeout(timeoutMs);
  }

  /**
   * Stop the sandbox (kill it)
   */
  async stop(): Promise<void> {
    await this.sandbox.kill();
    this._status = "stopped";
  }

  /**
   * Pause the sandbox
   */
  async pause(): Promise<void> {
    await this.sandbox.betaPause();
    this._status = "paused";
  }

  /**
   * Resume the sandbox
   */
  async resume(): Promise<void> {
    this.sandbox = await this.sandbox.connect();
    this._status = "running";
  }

  /**
   * Check if sandbox is running
   */
  async isRunning(): Promise<boolean> {
    return this.sandbox.isRunning();
  }

  /**
   * Set wake-on for the sandbox (no-op for E2B)
   */
  async setWakeOn(http: boolean, ssh: boolean): Promise<void> {
    void http;
    void ssh;
    // E2B doesn't have wake-on functionality
  }

  /**
   * Write a file to the sandbox
   */
  async writeFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content);
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(path: string): Promise<string> {
    return await this.sandbox.files.read(path);
  }

  /**
   * Get the underlying E2B Sandbox instance
   */
  getSandbox(): Sandbox {
    return this.sandbox;
  }
}

/**
 * E2B Client that provides a similar interface to MorphCloudClient
 */
export class E2BClient {
  private apiKey: string;

  constructor(config: E2BClientConfig = {}) {
    this.apiKey = config.apiKey || process.env.E2B_API_KEY || "";

    if (!this.apiKey) {
      throw new Error("E2B API key is required");
    }
  }

  private static toHttpServices(sandbox: Sandbox): E2BHttpService[] {
    return [
      {
        name: "vscode",
        port: 39378,
        url: `https://${sandbox.getHost(39378)}`,
      },
      {
        name: "worker",
        port: 39377,
        url: `https://${sandbox.getHost(39377)}`,
      },
      {
        name: "vnc",
        port: 39380,
        url: `https://${sandbox.getHost(39380)}`,
      },
      {
        name: "jupyter",
        port: 8888,
        url: `https://${sandbox.getHost(8888)}`,
      },
    ];
  }

  private static toSummary(info: SandboxInfo): E2BSandboxSummary {
    return {
      sandboxId: info.sandboxId,
      templateId: info.templateId,
      metadata: info.metadata,
      state: info.state,
      startedAt: info.startedAt,
      endAt: info.endAt,
    };
  }

  /**
   * Instances namespace for managing E2B sandboxes
   */
  instances = {
    /**
     * Start a new sandbox from a template
     */
    start: async (options: {
      templateId?: string;
      ttlSeconds?: number;
      ttlAction?: "pause" | "stop";
      metadata?: E2BMetadata;
      envs?: Record<string, string>;
      autoPause?: boolean;
      secure?: boolean;
      allowInternetAccess?: boolean;
    }): Promise<E2BInstance> => {
      const timeoutMs = (options.ttlSeconds || 3600) * 1000;
      const templateId = options.templateId || CMUX_DEVBOX_TEMPLATE_ID;

      const createOptions = {
        apiKey: this.apiKey,
        timeoutMs,
        metadata: options.metadata,
        envs: options.envs,
        secure: options.secure,
        allowInternetAccess: options.allowInternetAccess,
      };

      const sandbox = options.autoPause
        ? await Sandbox.betaCreate(templateId, {
            ...createOptions,
            autoPause: true,
          })
        : await Sandbox.create(templateId, createOptions);

      const httpServices = E2BClient.toHttpServices(sandbox);
      return new E2BInstance(
        sandbox,
        options.metadata || {},
        httpServices,
        "running"
      );
    },

    /**
     * Get an existing sandbox by ID
     * Note: connecting to a paused sandbox resumes it.
     */
    get: async (options: {
      instanceId: string;
      timeoutMs?: number;
    }): Promise<E2BInstance> => {
      const sandbox = await Sandbox.connect(options.instanceId, {
        apiKey: this.apiKey,
        timeoutMs: options.timeoutMs,
      });

      const httpServices = E2BClient.toHttpServices(sandbox);
      return new E2BInstance(sandbox, {}, httpServices, "running");
    },

    /**
     * Get metadata and state for a sandbox by ID.
     */
    getInfo: async (options: {
      instanceId: string;
    }): Promise<E2BSandboxSummary> => {
      const info = await Sandbox.getInfo(options.instanceId, {
        apiKey: this.apiKey,
      });
      return E2BClient.toSummary(info);
    },

    /**
     * List running/paused sandboxes.
     */
    list: async (options: E2BListOptions = {}): Promise<E2BSandboxSummary[]> => {
      const paginator = Sandbox.list({
        apiKey: this.apiKey,
        query: {
          metadata: options.metadata,
          state: options.state,
        },
        limit: options.limit,
      });

      const sandboxes: E2BSandboxSummary[] = [];
      while (paginator.hasNext) {
        const page = await paginator.nextItems();
        sandboxes.push(...page.map(E2BClient.toSummary));
      }

      return sandboxes;
    },

    /**
     * Kill a sandbox by ID
     */
    kill: async (sandboxId: string): Promise<void> => {
      await Sandbox.kill(sandboxId, { apiKey: this.apiKey });
    },

    /**
     * Pause a sandbox by ID.
     */
    pause: async (sandboxId: string): Promise<void> => {
      await Sandbox.betaPause(sandboxId, { apiKey: this.apiKey });
    },
  };
}

/**
 * Create an E2B client
 */
export const createE2BClient = (config: E2BClientConfig = {}): E2BClient => {
  return new E2BClient(config);
};

// Re-export types
export type { Sandbox } from "e2b";
