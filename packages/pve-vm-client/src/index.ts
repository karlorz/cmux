/**
 * Proxmox VE QEMU VM Client
 *
 * A client for managing QEMU virtual machines on Proxmox VE that mirrors
 * the PveLxcClient interface for seamless provider switching.
 * Supports canonical snapshot IDs (snapshot_*) with template VMID resolution.
 */

import { Agent, fetch as undiciFetch } from "undici";
import crypto from "node:crypto";

/**
 * Configuration for PveVmClient.
 * Environment-agnostic: all config is injected via constructor.
 */
export interface PveVmClientConfig {
  apiUrl: string;
  apiToken: string;
  node?: string;
  publicDomain?: string;
  verifyTls?: boolean;
  /** Resolve a snapshot ID to a template VMID. If not provided, templateVmid must be specified in StartVmOptions. */
  snapshotResolver?: (snapshotId: string) => Promise<{ templateVmid: number }> | { templateVmid: number };
}

/**
 * Result of command execution via QEMU Guest Agent
 */
export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/**
 * HTTP service exposed by the VM
 */
export interface HttpService {
  name: string;
  port: number;
  url: string;
}

/**
 * VM networking configuration
 */
export interface VmNetworking {
  httpServices: HttpService[];
  /** VM hostname / instance ID (e.g., "pvevm-abc123") */
  hostname?: string;
  /** Fully qualified domain name */
  fqdn?: string;
  /** IP address assigned to the VM */
  ipAddress?: string;
}

/**
 * VM instance metadata
 */
export interface VmMetadata {
  app?: string;
  teamId?: string;
  userId?: string;
  environmentId?: string;
  [key: string]: string | undefined;
}

/**
 * VM status
 */
export type VmStatus = "running" | "stopped" | "paused" | "unknown";

/**
 * PVE QEMU VM Instance
 */
export class PveVmInstance {
  public readonly id: string;
  public readonly vmid: number;
  public status: VmStatus;
  public metadata: VmMetadata;
  public networking: VmNetworking;

  private client: PveVmClient;

  constructor(
    client: PveVmClient,
    instanceId: string,
    vmid: number,
    status: VmStatus,
    metadata: VmMetadata,
    networking: VmNetworking,
    _node: string
  ) {
    this.client = client;
    this.vmid = vmid;
    this.id = instanceId;
    this.status = status;
    this.metadata = metadata;
    this.networking = networking;
  }

  /**
   * Execute a command in the VM via QEMU Guest Agent.
   * Requires qemu-guest-agent to be installed and running in the VM.
   */
  async exec(command: string): Promise<ExecResult> {
    return this.client.execInVm(this.vmid, command);
  }

  /**
   * Stop the VM
   */
  async stop(): Promise<void> {
    await this.client.stopVm(this.vmid);
    this.status = "stopped";
  }

  /**
   * Start the VM
   */
  async start(): Promise<void> {
    await this.client.startVm(this.vmid);
    this.status = "running";
  }

  /**
   * Delete the VM
   */
  async delete(): Promise<void> {
    await this.client.deleteVm(this.vmid);
  }

  /**
   * Get refresh instance state from PVE
   */
  async refresh(): Promise<void> {
    const updated = await this.client.getVmById(this.id);
    if (updated) {
      this.status = updated.status;
      this.networking = updated.networking;
    }
  }
}

/**
 * Options for starting a new VM
 */
export interface StartVmOptions {
  /** Template VMID to clone from (required if no snapshotResolver configured) */
  templateVmid?: number;
  /** Snapshot ID to resolve to template VMID (uses snapshotResolver) */
  snapshotId?: string;
  /** Number of CPU cores */
  cores?: number;
  /** Memory in MB */
  memory?: number;
  /** Disk size in GB */
  diskSize?: number;
  /** Metadata to attach to the VM */
  metadata?: VmMetadata;
  /** Whether to start the VM after creation */
  start?: boolean;
}

/**
 * PVE QEMU VM Client
 *
 * Manages QEMU virtual machines on Proxmox VE with an interface
 * compatible with the LXC client for provider abstraction.
 */
export class PveVmClient {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly node: string;
  private readonly publicDomain?: string;
  private readonly verifyTls: boolean;
  private readonly fetchAgent: Agent;
  private readonly snapshotResolver?: PveVmClientConfig["snapshotResolver"];

  constructor(config: PveVmClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.apiToken = config.apiToken;
    this.node = config.node ?? "pve";
    this.publicDomain = config.publicDomain;
    this.verifyTls = config.verifyTls ?? false;
    this.snapshotResolver = config.snapshotResolver;

    // Create fetch agent with optional TLS verification
    this.fetchAgent = new Agent({
      connect: {
        rejectUnauthorized: this.verifyTls,
      },
    });
  }

  /**
   * Make an authenticated request to the PVE API
   */
  private async pveRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `PVEAPIToken=${this.apiToken}`,
    };

    let requestBody: string | undefined;
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      requestBody = new URLSearchParams(
        Object.entries(body).map(([k, v]) => [k, String(v)])
      ).toString();
    }

    const response = await undiciFetch(url, {
      method,
      headers,
      body: requestBody,
      dispatcher: this.fetchAgent,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PVE API error ${response.status}: ${text}`);
    }

    const json = (await response.json()) as { data: T };
    return json.data;
  }

  /**
   * Generate a unique instance ID for a new VM
   */
  private generateInstanceId(): string {
    const suffix = crypto.randomBytes(6).toString("hex").slice(0, 8);
    return `pvevm-${suffix}`;
  }

  /**
   * Get the next available VMID
   */
  private async getNextVmid(): Promise<number> {
    const vms = await this.pveRequest<Array<{ vmid: number }>>(
      "GET",
      `/api2/json/nodes/${this.node}/qemu`
    );
    const usedVmids = new Set(vms.map((vm) => vm.vmid));

    // Start from 200 to leave room for templates (100-199)
    for (let vmid = 200; vmid < 10000; vmid++) {
      if (!usedVmids.has(vmid)) {
        return vmid;
      }
    }
    throw new Error("No available VMIDs");
  }

  /**
   * Clone a VM from a template
   */
  async cloneVm(
    templateVmid: number,
    newVmid: number,
    options: {
      name?: string;
      full?: boolean;
      description?: string;
    } = {}
  ): Promise<string> {
    const taskId = await this.pveRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/qemu/${templateVmid}/clone`,
      {
        newid: newVmid,
        name: options.name ?? `cmux-${newVmid}`,
        full: options.full ? 1 : 0,
        description: options.description ?? "cmux sandbox VM",
      }
    );
    return taskId;
  }

  /**
   * Wait for a PVE task to complete
   */
  async waitForTask(taskId: string, timeoutMs = 120000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const status = await this.pveRequest<{
        status: string;
        exitstatus?: string;
      }>("GET", `/api2/json/nodes/${this.node}/tasks/${taskId}/status`);

      if (status.status === "stopped") {
        if (status.exitstatus !== "OK") {
          throw new Error(`Task failed: ${status.exitstatus}`);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Task timed out after ${timeoutMs}ms`);
  }

  /**
   * Start a VM
   */
  async startVm(vmid: number): Promise<void> {
    const taskId = await this.pveRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/qemu/${vmid}/status/start`
    );
    await this.waitForTask(taskId);
  }

  /**
   * Stop a VM
   */
  async stopVm(vmid: number): Promise<void> {
    const taskId = await this.pveRequest<string>(
      "POST",
      `/api2/json/nodes/${this.node}/qemu/${vmid}/status/stop`
    );
    await this.waitForTask(taskId);
  }

  /**
   * Delete a VM
   */
  async deleteVm(vmid: number): Promise<void> {
    // Stop first if running
    try {
      await this.stopVm(vmid);
    } catch {
      // Ignore - may already be stopped
    }

    const taskId = await this.pveRequest<string>(
      "DELETE",
      `/api2/json/nodes/${this.node}/qemu/${vmid}`
    );
    await this.waitForTask(taskId);
  }

  /**
   * Execute a command in a VM via QEMU Guest Agent
   */
  async execInVm(vmid: number, command: string): Promise<ExecResult> {
    // Use guest-exec API
    const execResult = await this.pveRequest<{ pid: number }>(
      "POST",
      `/api2/json/nodes/${this.node}/qemu/${vmid}/agent/exec`,
      {
        command: "bash",
        "input-data": Buffer.from(command).toString("base64"),
      }
    );

    // Wait for completion
    const pid = execResult.pid;
    let result: { exited: boolean; exitcode?: number; "out-data"?: string; "err-data"?: string };

    const start = Date.now();
    const timeoutMs = 60000;

    while (Date.now() - start < timeoutMs) {
      result = await this.pveRequest<typeof result>(
        "GET",
        `/api2/json/nodes/${this.node}/qemu/${vmid}/agent/exec-status?pid=${pid}`
      );

      if (result.exited) {
        return {
          exit_code: result.exitcode ?? 0,
          stdout: result["out-data"]
            ? Buffer.from(result["out-data"], "base64").toString()
            : "",
          stderr: result["err-data"]
            ? Buffer.from(result["err-data"], "base64").toString()
            : "",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Command execution timed out");
  }

  /**
   * Get VM configuration including network info
   */
  async getVmConfig(vmid: number): Promise<{
    name?: string;
    cores?: number;
    memory?: number;
    net0?: string;
    description?: string;
  }> {
    return this.pveRequest(
      "GET",
      `/api2/json/nodes/${this.node}/qemu/${vmid}/config`
    );
  }

  /**
   * Get VM status
   */
  async getVmStatus(vmid: number): Promise<{
    status: string;
    vmid: number;
    name?: string;
    uptime?: number;
  }> {
    return this.pveRequest(
      "GET",
      `/api2/json/nodes/${this.node}/qemu/${vmid}/status/current`
    );
  }

  /**
   * Get VM by instance ID
   */
  async getVmById(instanceId: string): Promise<PveVmInstance | null> {
    // Extract VMID from instance ID (format: pvevm-XXXXXXXX or pvevm_XXXXXXXX)
    const vmidMatch = instanceId.match(/^pvevm[-_]([a-z0-9]+)$/i);
    if (!vmidMatch) {
      return null;
    }

    // List all VMs and find by name matching instance ID
    const vms = await this.pveRequest<
      Array<{ vmid: number; name?: string; status: string }>
    >("GET", `/api2/json/nodes/${this.node}/qemu`);

    const vm = vms.find(
      (v) => v.name === instanceId || v.name === `cmux-${v.vmid}`
    );
    if (!vm) {
      return null;
    }

    const config = await this.getVmConfig(vm.vmid);
    const metadata = this.parseMetadataFromDescription(config.description);

    return new PveVmInstance(
      this,
      instanceId,
      vm.vmid,
      this.mapStatus(vm.status),
      metadata,
      await this.buildNetworking(vm.vmid, instanceId),
      this.node
    );
  }

  /**
   * Parse metadata from VM description (JSON format)
   */
  private parseMetadataFromDescription(description?: string): VmMetadata {
    if (!description) return {};
    try {
      const parsed = JSON.parse(description);
      return typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Map PVE status string to VmStatus
   */
  private mapStatus(status: string): VmStatus {
    switch (status.toLowerCase()) {
      case "running":
        return "running";
      case "stopped":
        return "stopped";
      case "paused":
        return "paused";
      default:
        return "unknown";
    }
  }

  /**
   * Build networking info for a VM
   */
  private async buildNetworking(
    vmid: number,
    instanceId: string
  ): Promise<VmNetworking> {
    // Get IP address from guest agent if available
    let ipAddress: string | undefined;
    try {
      const networkInfo = await this.pveRequest<{
        result?: Array<{
          name: string;
          "ip-addresses"?: Array<{ "ip-address": string; "ip-address-type": string }>;
        }>;
      }>("GET", `/api2/json/nodes/${this.node}/qemu/${vmid}/agent/network-get-interfaces`);

      const eth0 = networkInfo.result?.find((iface) =>
        iface.name.startsWith("eth") || iface.name.startsWith("ens")
      );
      const ipv4 = eth0?.["ip-addresses"]?.find(
        (addr) => addr["ip-address-type"] === "ipv4"
      );
      ipAddress = ipv4?.["ip-address"];
    } catch {
      // Guest agent may not be available
    }

    const baseUrl = this.publicDomain
      ? `https://${instanceId}.${this.publicDomain}`
      : ipAddress
        ? `http://${ipAddress}`
        : undefined;

    const httpServices: HttpService[] = [];
    if (baseUrl) {
      // Standard cmux sandbox ports
      httpServices.push(
        { name: "vscode", port: 9998, url: `${baseUrl}:9998` },
        { name: "worker", port: 9997, url: `${baseUrl}:9997` },
        { name: "xterm", port: 9996, url: `${baseUrl}:9996` }
      );
    }

    return {
      httpServices,
      hostname: instanceId,
      fqdn: this.publicDomain ? `${instanceId}.${this.publicDomain}` : undefined,
      ipAddress,
    };
  }

  /**
   * Create a new VM from a template
   */
  async createVm(options: StartVmOptions): Promise<PveVmInstance> {
    // Resolve template VMID
    let templateVmid = options.templateVmid;
    if (!templateVmid && options.snapshotId && this.snapshotResolver) {
      const resolved = await this.snapshotResolver(options.snapshotId);
      templateVmid = resolved.templateVmid;
    }
    if (!templateVmid) {
      throw new Error("templateVmid or snapshotId with resolver required");
    }

    const newVmid = await this.getNextVmid();
    const instanceId = this.generateInstanceId();

    // Clone the template
    const cloneTask = await this.cloneVm(templateVmid, newVmid, {
      name: instanceId,
      full: true,
      description: JSON.stringify(options.metadata ?? {}),
    });
    await this.waitForTask(cloneTask);

    // Configure VM resources if specified
    if (options.cores || options.memory) {
      await this.pveRequest(
        "PUT",
        `/api2/json/nodes/${this.node}/qemu/${newVmid}/config`,
        {
          ...(options.cores && { cores: options.cores }),
          ...(options.memory && { memory: options.memory }),
        }
      );
    }

    // Start if requested
    if (options.start !== false) {
      await this.startVm(newVmid);
    }

    return new PveVmInstance(
      this,
      instanceId,
      newVmid,
      options.start !== false ? "running" : "stopped",
      options.metadata ?? {},
      await this.buildNetworking(newVmid, instanceId),
      this.node
    );
  }

  /**
   * List all VMs
   */
  async listVms(): Promise<PveVmInstance[]> {
    const vms = await this.pveRequest<
      Array<{ vmid: number; name?: string; status: string }>
    >("GET", `/api2/json/nodes/${this.node}/qemu`);

    const instances: PveVmInstance[] = [];
    for (const vm of vms) {
      // Skip templates (usually VMID < 200)
      if (vm.vmid < 200) continue;

      const instanceId = vm.name ?? `cmux-${vm.vmid}`;
      const config = await this.getVmConfig(vm.vmid);
      const metadata = this.parseMetadataFromDescription(config.description);

      instances.push(
        new PveVmInstance(
          this,
          instanceId,
          vm.vmid,
          this.mapStatus(vm.status),
          metadata,
          await this.buildNetworking(vm.vmid, instanceId),
          this.node
        )
      );
    }

    return instances;
  }

  /**
   * Get the configured node
   */
  getNode(): string {
    return this.node;
  }
}
