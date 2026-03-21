import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { PVE_LXC_SNAPSHOT_PRESETS } from "@/lib/utils/pve-lxc-defaults";
import {
  MORPH_SNAPSHOT_PRESETS,
  SANDBOX_PROVIDER_CAPABILITIES,
  SANDBOX_PROVIDER_DISPLAY_NAMES,
  filterVisiblePresets,
  type SandboxConfig,
  type SandboxPreset,
  type SandboxProviderType,
} from "@cmux/shared";
import { CONFIG_PROVIDERS } from "@cmux/shared/provider-types";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

function toProviderType(provider: string): SandboxProviderType {
  switch (provider) {
    case "pve-lxc":
      return "pve-lxc";
    case "pve-vm":
      return "pve-vm";
    case "morph":
    default:
      return "morph";
  }
}

function getPresetsForProvider(providerType: SandboxProviderType): SandboxPreset[] {
  switch (providerType) {
    case "pve-lxc":
      return PVE_LXC_SNAPSHOT_PRESETS.map((preset) => ({
        id: preset.id,
        presetId: preset.presetId,
        label: preset.label,
        cpu: preset.cpu,
        memory: preset.memory,
        disk: preset.disk,
        description: preset.description,
      }));
    case "pve-vm":
      return [];
    case "morph":
    default:
      return MORPH_SNAPSHOT_PRESETS.map((preset) => ({
        id: preset.id,
        presetId: preset.presetId,
        label: preset.label,
        cpu: preset.cpu,
        memory: preset.memory,
        disk: preset.disk,
        description: preset.description,
      }));
  }
}

function getDefaultPresetId(providerType: SandboxProviderType): string {
  switch (providerType) {
    case "pve-lxc":
      return PVE_LXC_SNAPSHOT_PRESETS[0]?.presetId ?? "";
    case "pve-vm":
      return "";
    case "morph":
    default:
      return MORPH_SNAPSHOT_PRESETS[0]?.presetId ?? "";
  }
}

const SandboxPresetSchema = z
  .object({
    id: z.string(),
    presetId: z.string(),
    label: z.string(),
    cpu: z.string(),
    memory: z.string(),
    disk: z.string(),
    description: z.string().optional(),
  })
  .openapi("SandboxPreset");

const SandboxProviderCapabilitiesSchema = z
  .object({
    supportsHibernate: z.boolean(),
    supportsSnapshots: z.boolean(),
    supportsResize: z.boolean(),
    supportsNestedVirt: z.boolean(),
    supportsGpu: z.boolean(),
  })
  .openapi("SandboxProviderCapabilities");

const SandboxConfigSchema = z
  .object({
    provider: z.enum(CONFIG_PROVIDERS),
    providerDisplayName: z.string(),
    presets: z.array(SandboxPresetSchema),
    defaultPresetId: z.string(),
    capabilities: SandboxProviderCapabilitiesSchema,
  })
  .openapi("SandboxConfig");

export const configSandboxRouter = new OpenAPIHono();

configSandboxRouter.openapi(
  createRoute({
    method: "get",
    path: "/config/sandbox",
    tags: ["Config"],
    summary: "Get sandbox provider configuration",
    description:
      "Returns the active sandbox provider and available presets for environment creation",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SandboxConfigSchema,
          },
        },
        description: "Sandbox configuration",
      },
      500: {
        description: "No sandbox provider configured",
      },
    },
  }),
  (c) => {
    try {
      const providerConfig = getActiveSandboxProvider();
      const providerType = toProviderType(providerConfig.provider);
      const allPresets = getPresetsForProvider(providerType);
      const visiblePresets = filterVisiblePresets(allPresets);

      const config: SandboxConfig = {
        provider: providerType,
        providerDisplayName: SANDBOX_PROVIDER_DISPLAY_NAMES[providerType],
        presets: visiblePresets,
        defaultPresetId: getDefaultPresetId(providerType),
        capabilities: SANDBOX_PROVIDER_CAPABILITIES[providerType],
      };

      return c.json(config);
    } catch (error) {
      console.error("Failed to get sandbox config:", error);
      return c.text("No sandbox provider configured", 500);
    }
  },
);
