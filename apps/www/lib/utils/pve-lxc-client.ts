/**
 * Proxmox VE LXC Client
 *
 * A client for managing LXC containers on Proxmox VE that mirrors
 * the MorphCloudClient interface for seamless provider switching.
 */

import { env } from "./www-env";
import { spawn } from "node:child_process";
import { Agent } from "undici";

// PVE often uses self-signed certificates, so we need a custom agent
const pveHttpsAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});

/**
 * Result of command execution
 */
export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/**
 * HTTP service exposed by the container
 */
export interface HttpService {
  name: string;
  port: number;
  url: string;
}

/**
 * Container networking configuration
 */
export interface ContainerNetworking {
  httpServices: HttpService[];
  ipAddress?: string;
}

/**
 * Container instance metadata
 */
export interface ContainerMetadata {
  app?: string;
  teamId?: string;
  userId?: string;
  environmentId?: string;
  [key: string]: string | undefined;
}

/**
 * Container status
 */
export type ContainerStatus = "running" | "stopped" | "paused" | "unknown";

/**
 * PVE LXC Container Instance
 */
export class PveLxcInstance {
  public readonly id: string;
  public readonly vmid: number;
  public status: ContainerStatus;
  public metadata: ContainerMetadata;
  public networking: ContainerNetworking;

  private client: PveLxcClient;
  private node: string;
  private sshHost: string;

  constructor(
    client: PveLxcClient,
    vmid: number,
    status: ContainerStatus,
    metadata: ContainerMetadata,
    networking: ContainerNetworking,
    node: string,
    sshHost: string
  ) {
    this.client = client;
    this.vmid = vmid;
    this.id = `pve_lxc_${vmid}`;
    this.status = status;
    this.metadata = metadata;
    this.networking = networking;
    this.node = node;
    this.sshHost = sshHost;
  }

  /**
   * Execute a command inside the container via SSH + pct exec
   */
  async exec(command: string): Promise<ExecResult> {
    return this.client.execInContainer(this.vmid, command);
  }

  /**
   * Start the container
   */
  async start(): Promise<void> {
    await this.client.startContainer(this.vmid);
    this.status = "running";
  }

  /**
   * Stop the container
   */
  async stop(): Promise<void> {
    await this.client.stopContainer(this.vmid);
    this.status = "stopped";
  }

  /**
   * Pause the container (PVE uses freeze for LXC)
   */
  async pause(): Promise<void> {
    await this.client.suspendContainer(this.vmid);
    this.status = "paused";
  }

  /**
   * Resume the container
   */
  async resume(): Promise<void> {
    await this.client.resumeContainer(this.vmid);
    this.status = "running";
  }

  /**
   * Expose an HTTP service (stores in metadata, actual exposure via IP)
   */
  async exposeHttpService(name: string, port: number): Promise<void> {
    // For PVE LXC, we expose services via direct container IP
    const ipAddress = this.networking.ipAddress;
    if (!ipAddress) {
      throw new Error("Container IP address not available");
    }

    const url = `http://${ipAddress}:${port}`;
    const existingService = this.networking.httpServices.find(
      (s) => s.name === name
    );
    if (existingService) {
      existingService.port = port;
      existingService.url = url;
    } else {
      this.networking.httpServices.push({ name, port, url });
    }
  }

  /**
   * Hide an HTTP service
   */
  async hideHttpService(name: string): Promise<void> {
    this.networking.httpServices = this.networking.httpServices.filter(
      (s) => s.name !== name
    );
  }

  /**
   * Set wake-on behavior (no-op for PVE, compatibility with Morph)
   */
  async setWakeOn(_http: boolean, _ssh: boolean): Promise<void> {
    // PVE LXC doesn't have wake-on functionality like Morph
    // This is a no-op for compatibility
  }
}

/**
 * Options for starting a container
 */
export interface StartContainerOptions {
  snapshotId: string;
  ttlSeconds?: number;
  ttlAction?: "pause" | "stop";
  metadata?: ContainerMetadata;
}

/**
 * PVE API response types
 */
interface PveApiResponse<T> {
  data: T;
}

interface PveTaskStatus {
  status: string;
  exitstatus?: string;
}

interface PveContainerStatus {
  status: string;
  vmid: number;
  name?: string;
  cpus?: number;
  maxmem?: number;
  maxdisk?: number;
}

interface PveContainerConfig {
  hostname?: string;
  cores?: number;
  memory?: number;
  net0?: string;
  rootfs?: string;
  description?: string;
}

/**
 * Proxmox VE LXC Client
 */
export class PveLxcClient {
  private apiUrl: string;
  private apiToken: string;
  private node: string;
  private sshHost: string;

  // In-memory store for instance metadata (PVE doesn't have native metadata support)
  private instanceMetadata: Map<number, ContainerMetadata> = new Map();
  private instanceServices: Map<number, HttpService[]> = new Map();

  constructor(options: {
    apiUrl: string;
    apiToken: string;
    node?: string;
  }) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.apiToken = options.apiToken;
    this.node = options.node || "pve";

    // Extract SSH host from API URL
    const url = new URL(this.apiUrl);
    this.sshHost = `root@${url.hostname}`;
  }

  /**
   * Make an API request to PVE
   */
  private async apiRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `PVEAPIToken=${this.apiToken}`,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      options.body = new URLSearchParams(
        Object.entries(body).map(([k, v]) => [k, String(v)])
      ).toString();
    }

    const response = await fetch(url, {
      ...options,
      // @ts-expect-error - dispatcher is a Node.js fetch extension for undici
      dispatcher: pveHttpsAgent,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PVE API error ${response.status}: ${text}`);
    }

    const json = (await response.json()) as PveApiResponse<T>;
    return json.data;
  }

  /**
   * Wait for a PVE task to complete
   */
  private async waitForTask(
    upid: string,
    timeoutMs: number = 300000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.apiRequest<PveTaskStatus>(
        "GET",
        `/api2/json/nodes/${this.node}/tasks/${encodeURIComponent(upid)}/status`
      );

      if (status.status === "stopped") {
        if (status.exitstatus !== "OK") {
          throw new Error(`Task failed: ${status.exitstatus}`);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error("Task timeout");
  }

  /**
   * Execute a command on the PVE host via SSH
   */
  private async sshExec(command: string): Promise<ExecResult> {
    return new Promise((resolve) => {
      const sshArgs = [
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "ConnectTimeout=10",
        this.sshHost,
        command,
      ];

      const proc = spawn("ssh", sshArgs);
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({
          exit_code: code ?? 1,
          stdout,
          stderr,
        });
      });

      proc.on("error", (err) => {
        resolve({
          exit_code: 1,
          stdout: "",
          stderr: err.message,
        });
      });
    });
  }

  /**
   * Execute a command inside an LXC container via pct exec
   */
  async execInContainer(vmid: number, command: string): Promise<ExecResult> {
    // Escape the command for shell
    const escapedCommand = command.replace(/'/g, "'\\''");
    const pctCommand = `pct exec ${vmid} -- bash -lc '${escapedCommand}'`;
    return this.sshExec(pctCommand);
  }

  /**
   * Get the next available VMID
   */
  private async findNextVmid(): Promise<number> {
    const containers = await this.apiRequest<PveContainerStatus[]>(
      "GET",
      `/api2/json/nodes/${this.node}/lxc`
    );

    const usedVmids = new Set(containers.map((c) => c.vmid));
    let vmid = 100;
    while (usedVmids.has(vmid)) {
      vmid++;
    }
    return vmid;
  }

  /**
   * Get container IP address from network config
   */
  private async getContainerIp(vmid: number): Promise<string | undefined> {
    try {
      const config = await this.apiRequest<PveContainerConfig>(
        "GET",
        `/api2/json/nodes/${this.node}/lxc/${vmid}/config`
      );

      // Parse IP from net0 config (format: name=eth0,bridge=vmbr0,ip=10.0.0.x/24,...)
      if (config.net0) {
        const ipMatch = config.net0.match(/ip=([^/,]+)/);
        if (ipMatch) {
          return ipMatch[1];
        }
      }

      // Try to get IP from container status via exec
      const result = await this.execInContainer(
        vmid,
        "hostname -I | awk '{print $1}'"
      );
      if (result.exit_code === 0 && result.stdout.trim()) {
        return result.stdout.trim();
      }
    } catch {
      // IP not available yet
    }
    return undefined;
  }

  /**
   * Parse snapshot ID to extract vmid and snapshot name
   */
  private parseSnapshotId(snapshotId: string): {
    vmid: number;
    snapshotName: string;
  } {
    // Format: pve_{vmid}_{snapshotName}
    const match = snapshotId.match(/^pve_(\d+)_(.+)$/);
    if (!match) {
      throw new Error(`Invalid PVE snapshot ID format: ${snapshotId}`);
    }
    return {
      vmid: parseInt(match[1], 10),
      snapshotName: match[2],
    };
  }

  /**
   * Clone a container from a snapshot
   */
  private async cloneContainer(
    sourceVmid: number,
    snapshotName: string,
    newVmid: number,
    hostname: string
  ): Promise<void> {
    const upid = await this.apiRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/lxc/${sourceVmid}/clone`,
      {
        newid: newVmid,
        hostname,
        snapname: snapshotName,
        full: 1, // Full clone, not linked
      }
    );

    await this.waitForTask(upid);
  }

  /**
   * Start a container
   */
  async startContainer(vmid: number): Promise<void> {
    const upid = await this.apiRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/lxc/${vmid}/status/start`
    );
    await this.waitForTask(upid);
  }

  /**
   * Stop a container
   */
  async stopContainer(vmid: number): Promise<void> {
    const upid = await this.apiRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/lxc/${vmid}/status/stop`
    );
    await this.waitForTask(upid);
  }

  /**
   * Suspend (freeze) a container
   */
  async suspendContainer(vmid: number): Promise<void> {
    const upid = await this.apiRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/lxc/${vmid}/status/suspend`
    );
    await this.waitForTask(upid);
  }

  /**
   * Resume a suspended container
   */
  async resumeContainer(vmid: number): Promise<void> {
    const upid = await this.apiRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/lxc/${vmid}/status/resume`
    );
    await this.waitForTask(upid);
  }

  /**
   * Delete a container
   */
  async deleteContainer(vmid: number): Promise<void> {
    // Stop first if running
    try {
      await this.stopContainer(vmid);
    } catch {
      // May already be stopped
    }

    const upid = await this.apiRequest<string>(
      "DELETE",
      `/api2/json/nodes/${this.node}/lxc/${vmid}`
    );
    await this.waitForTask(upid);

    // Clean up metadata
    this.instanceMetadata.delete(vmid);
    this.instanceServices.delete(vmid);
  }

  /**
   * Get container status
   */
  private async getContainerStatus(
    vmid: number
  ): Promise<ContainerStatus> {
    try {
      const status = await this.apiRequest<PveContainerStatus>(
        "GET",
        `/api2/json/nodes/${this.node}/lxc/${vmid}/status/current`
      );

      switch (status.status) {
        case "running":
          return "running";
        case "stopped":
          return "stopped";
        case "paused":
          return "paused";
        default:
          return "unknown";
      }
    } catch {
      return "unknown";
    }
  }

  /**
   * Instances namespace (mirrors MorphCloudClient.instances)
   */
  instances = {
    /**
     * Start a new container from a snapshot
     */
    start: async (options: StartContainerOptions): Promise<PveLxcInstance> => {
      const { vmid: sourceVmid, snapshotName } = this.parseSnapshotId(
        options.snapshotId
      );
      const newVmid = await this.findNextVmid();
      const hostname = `cmux-${newVmid}`;

      console.log(
        `[PveLxcClient] Cloning container from ${sourceVmid}:${snapshotName} to ${newVmid}`
      );

      // Clone the container
      await this.cloneContainer(sourceVmid, snapshotName, newVmid, hostname);

      // Start the container
      await this.startContainer(newVmid);

      // Wait for container to be fully running
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Get container IP
      const ipAddress = await this.getContainerIp(newVmid);

      // Store metadata
      const metadata = options.metadata || {};
      this.instanceMetadata.set(newVmid, metadata);

      // Initialize services with standard cmux ports
      const services: HttpService[] = [];
      if (ipAddress) {
        services.push(
          { name: "vscode", port: 39378, url: `http://${ipAddress}:39378` },
          { name: "worker", port: 39377, url: `http://${ipAddress}:39377` }
        );
      }
      this.instanceServices.set(newVmid, services);

      const instance = new PveLxcInstance(
        this,
        newVmid,
        "running",
        metadata,
        { httpServices: services, ipAddress },
        this.node,
        this.sshHost
      );

      console.log(
        `[PveLxcClient] Container ${newVmid} started with IP ${ipAddress || "pending"}`
      );

      return instance;
    },

    /**
     * Get an existing container instance
     */
    get: async (options: { instanceId: string }): Promise<PveLxcInstance> => {
      // Parse instance ID (format: pve_lxc_{vmid})
      const match = options.instanceId.match(/^pve_lxc_(\d+)$/);
      if (!match) {
        throw new Error(`Invalid PVE LXC instance ID: ${options.instanceId}`);
      }
      const vmid = parseInt(match[1], 10);

      const status = await this.getContainerStatus(vmid);
      const ipAddress = await this.getContainerIp(vmid);
      const metadata = this.instanceMetadata.get(vmid) || {};
      const services = this.instanceServices.get(vmid) || [];

      return new PveLxcInstance(
        this,
        vmid,
        status,
        metadata,
        { httpServices: services, ipAddress },
        this.node,
        this.sshHost
      );
    },

    /**
     * List all cmux containers
     */
    list: async (): Promise<PveLxcInstance[]> => {
      const containers = await this.apiRequest<PveContainerStatus[]>(
        "GET",
        `/api2/json/nodes/${this.node}/lxc`
      );

      const instances: PveLxcInstance[] = [];
      for (const container of containers) {
        const metadata = this.instanceMetadata.get(container.vmid);
        // Only include containers we know about (have metadata)
        if (metadata?.app?.startsWith("cmux")) {
          const status = await this.getContainerStatus(container.vmid);
          const ipAddress = await this.getContainerIp(container.vmid);
          const services = this.instanceServices.get(container.vmid) || [];

          instances.push(
            new PveLxcInstance(
              this,
              container.vmid,
              status,
              metadata,
              { httpServices: services, ipAddress },
              this.node,
              this.sshHost
            )
          );
        }
      }

      return instances;
    },
  };
}

/**
 * Create a PVE LXC client instance
 */
export function getPveLxcClient(): PveLxcClient {
  if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
    throw new Error("PVE API URL and token not configured");
  }

  return new PveLxcClient({
    apiUrl: env.PVE_API_URL,
    apiToken: env.PVE_API_TOKEN,
    node: env.PVE_NODE,
  });
}
