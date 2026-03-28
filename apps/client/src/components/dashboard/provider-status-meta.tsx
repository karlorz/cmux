import { getVendorDisplayName } from "@/lib/model-vendor-utils";
import type { ProviderStatusResponse } from "@cmux/shared";
import { AGENT_CATALOG, type AgentCatalogEntry } from "@cmux/shared/agent-catalog";
import type { ReactNode } from "react";

const AGENT_PREFIX_TO_VENDOR = {
  claude: "anthropic",
  codex: "openai",
  gemini: "google",
  opencode: "opencode",
  qwen: "qwen",
  cursor: "cursor",
  amp: "amp",
  grok: "xai",
  openrouter: "openrouter",
} as const;

export type AggregatedVendorStatus = {
  vendor: string;
  label: string;
  isAvailable: boolean;
  detail: string;
};

export type ProviderStatusMeta = {
  statusTone?: "healthy" | "warning" | "error";
  statusLabel?: string;
  statusDetail?: string;
  warning?: {
    tooltip: ReactNode;
    onClick?: () => void;
  };
  isUnavailable?: boolean;
};

function formatProviderLabel(vendor: string): string {
  return getVendorDisplayName(vendor);
}

export function getVendorForAgentName(agentName: string): string | null {
  const catalogVendor = AGENT_CATALOG.find(
    (entry: AgentCatalogEntry) => entry.name === agentName
  )?.vendor;
  if (catalogVendor) {
    return catalogVendor;
  }

  const prefix = agentName.split("/")[0] as keyof typeof AGENT_PREFIX_TO_VENDOR;
  return AGENT_PREFIX_TO_VENDOR[prefix] ?? null;
}

function createProviderSettingsTooltip(providerLabel: string, detail: string) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{providerLabel} setup needed</p>
      <p>{detail}</p>
      <p className="text-neutral-500 dark:text-neutral-400">
        Open AI Providers settings to finish setup.
      </p>
    </div>
  );
}

export function buildAggregatedVendorStatuses(
  providerStatus: ProviderStatusResponse | null | undefined
): Map<string, AggregatedVendorStatus> {
  const statuses = new Map<string, AggregatedVendorStatus>();

  for (const provider of providerStatus?.providers ?? []) {
    const vendor = getVendorForAgentName(provider.name);
    if (!vendor) {
      continue;
    }

    const label = formatProviderLabel(vendor);
    const detail = provider.isAvailable
      ? `${label} is ready.`
      : provider.missingRequirements?.[0] ?? `${label} setup is incomplete.`;
    const existing = statuses.get(vendor);

    if (!existing) {
      statuses.set(vendor, {
        vendor,
        label,
        isAvailable: provider.isAvailable,
        detail,
      });
      continue;
    }

    if (existing.isAvailable) {
      continue;
    }

    if (provider.isAvailable) {
      statuses.set(vendor, {
        vendor,
        label,
        isAvailable: true,
        detail: `${label} is ready.`,
      });
    }
  }

  return statuses;
}

export function getProviderStatusMeta(
  vendorStatuses: Map<string, AggregatedVendorStatus>,
  vendor: string,
  onClick: () => void,
  hasProviderStatus: boolean
): ProviderStatusMeta {
  if (!hasProviderStatus) {
    return {};
  }

  const providerLabel = formatProviderLabel(vendor);
  const status = vendorStatuses.get(vendor);

  if (!status) {
    return {
      statusTone: "warning",
      statusLabel: "Status unavailable",
      statusDetail: `${providerLabel} status is unavailable right now.`,
      warning: {
        tooltip: createProviderSettingsTooltip(
          providerLabel,
          `${providerLabel} status is unavailable right now.`
        ),
        onClick,
      },
    };
  }

  if (status.isAvailable) {
    return {
      statusTone: "healthy",
      statusLabel: "Ready",
      statusDetail: status.detail,
    };
  }

  return {
    statusTone: "warning",
    statusLabel: "Setup needed",
    statusDetail: status.detail,
    isUnavailable: true,
    warning: {
      tooltip: createProviderSettingsTooltip(providerLabel, status.detail),
      onClick,
    },
  };
}

export function isAgentBlockedByProviderStatus(
  agentName: string,
  providerStatus: ProviderStatusResponse | null | undefined
): boolean {
  if (!providerStatus?.success) {
    return false;
  }

  const vendor = getVendorForAgentName(agentName);
  if (!vendor) {
    return false;
  }

  const status = buildAggregatedVendorStatuses(providerStatus).get(vendor);
  return status ? !status.isAvailable : false;
}
