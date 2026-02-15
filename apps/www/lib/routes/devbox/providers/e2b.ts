import {
  E2BClient,
  type E2BHttpService,
  type E2BMetadata,
  type E2BSandboxSummary,
} from "@cmux/e2b-client";
import { DEFAULT_E2B_TEMPLATE_ID } from "@cmux/shared/e2b-templates";
import type {
  CreateDevboxOptions,
  DevboxExecResult,
  DevboxInstance,
  DevboxListOptions,
  DevboxProvider,
} from "./index";

const getServiceUrl = (
  services: E2BHttpService[],
  port: number
): string | undefined => services.find((service) => service.port === port)?.url;

const toBaseInstance = (summary: E2BSandboxSummary): DevboxInstance => ({
  id: summary.sandboxId,
  provider: "e2b",
  status: summary.state === "paused" ? "paused" : "running",
  name: summary.metadata.name,
  templateId: summary.templateId,
  metadata: summary.metadata,
  createdAt: summary.startedAt.getTime(),
});

const withRunningUrls = (
  base: DevboxInstance,
  services: E2BHttpService[]
): DevboxInstance => ({
  ...base,
  status: "running",
  jupyterUrl: getServiceUrl(services, 8888),
  vscodeUrl: getServiceUrl(services, 39378),
  workerUrl: getServiceUrl(services, 39377),
  vncUrl: getServiceUrl(services, 39380),
});

export class E2BDevboxProvider implements DevboxProvider {
  private client: E2BClient;

  constructor(client?: E2BClient) {
    this.client = client ?? new E2BClient();
  }

  async createInstance(options: CreateDevboxOptions): Promise<DevboxInstance> {
    const metadata: E2BMetadata = {
      ...(options.metadata ?? {}),
    };

    if (options.name && !metadata.name) {
      metadata.name = options.name;
    }

    const instance = await this.client.instances.start({
      templateId: options.templateId ?? DEFAULT_E2B_TEMPLATE_ID,
      ttlSeconds: options.ttlSeconds,
      metadata,
      envs: options.envs,
      autoPause: options.autoPause,
      secure: options.secure,
      allowInternetAccess: options.allowInternetAccess,
    });

    return withRunningUrls(
      {
        id: instance.id,
        provider: "e2b",
        status: instance.status,
        name: metadata.name,
        templateId: options.templateId ?? DEFAULT_E2B_TEMPLATE_ID,
        metadata,
        createdAt: Date.now(),
      },
      instance.networking.httpServices
    );
  }

  async getInstance(id: string): Promise<DevboxInstance> {
    const info = await this.client.instances.getInfo({ instanceId: id });
    const base = toBaseInstance(info);

    if (info.state === "paused") {
      return base;
    }

    const instance = await this.client.instances.get({ instanceId: id });
    return withRunningUrls(base, instance.networking.httpServices);
  }

  async listInstances(options: DevboxListOptions = {}): Promise<DevboxInstance[]> {
    const summaries = await this.client.instances.list({
      metadata: options.metadata,
      limit: options.limit,
    });

    return summaries.map(toBaseInstance);
  }

  async stopInstance(id: string): Promise<void> {
    await this.client.instances.kill(id);
  }

  async pauseInstance(id: string): Promise<void> {
    await this.client.instances.pause(id);
  }

  async resumeInstance(id: string): Promise<void> {
    // Connecting to a paused sandbox resumes it.
    await this.client.instances.get({ instanceId: id });
  }

  async deleteInstance(id: string): Promise<void> {
    await this.client.instances.kill(id);
  }

  async extendTimeout(id: string, timeoutMs: number): Promise<void> {
    const instance = await this.client.instances.get({
      instanceId: id,
      timeoutMs,
    });
    await instance.setTimeout(timeoutMs);
  }

  async exec(
    id: string,
    command: string,
    timeoutMs?: number
  ): Promise<DevboxExecResult> {
    const instance = await this.client.instances.get({ instanceId: id });
    const result = await instance.exec(command, { timeoutMs });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exit_code,
    };
  }

  async getAuthToken(id: string): Promise<string> {
    const result = await this.exec(
      id,
      "cat /home/user/.worker-auth-token 2>/dev/null || echo ''",
      10_000
    );

    return result.stdout.trim();
  }
}
