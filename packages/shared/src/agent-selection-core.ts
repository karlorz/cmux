import type { AgentCatalogEntry, ModelVariant } from "./agent-catalog";
import { AGENT_CATALOG } from "./agent-catalog";

const CODEX_REASONING_VARIANTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

type KnownCodexReasoningVariant = (typeof CODEX_REASONING_VARIANTS)[number];

function isKnownCodexReasoningVariant(
  value: string,
): value is KnownCodexReasoningVariant {
  return CODEX_REASONING_VARIANTS.includes(value as KnownCodexReasoningVariant);
}

function findCatalogEntryByName(name: string): AgentCatalogEntry | undefined {
  return AGENT_CATALOG.find((entry) => entry.name === name);
}

function getDeclaredVariants(entry?: AgentCatalogEntry): ModelVariant[] {
  return entry?.variants ?? [];
}

function inferLegacyVariant(agentName: string): {
  baseAgentName: string;
  inferredVariant?: string;
} {
  for (const entry of AGENT_CATALOG) {
    for (const variant of getDeclaredVariants(entry)) {
      if (agentName === `${entry.name}-${variant.id}`) {
        return {
          baseAgentName: entry.name,
          inferredVariant: variant.id,
        };
      }
    }
  }

  if (agentName.startsWith("codex/")) {
    for (const variant of CODEX_REASONING_VARIANTS) {
      const suffix = `-${variant}`;
      if (agentName.endsWith(suffix) && agentName.length > suffix.length) {
        return {
          baseAgentName: agentName.slice(0, -suffix.length),
          inferredVariant: variant,
        };
      }
    }
  }

  return { baseAgentName: agentName };
}

function formatAllowedVariants(variants: readonly ModelVariant[]): string {
  return variants.map((variant) => variant.id).join(", ");
}

function resolveRequestedVariant(
  agentName: string,
  entry: AgentCatalogEntry | undefined,
  selectedVariant: string | null | undefined,
  inferredVariant: string | undefined,
  applyDefaultVariant: boolean,
): string | undefined {
  const explicitVariant = selectedVariant?.trim() || undefined;

  if (
    explicitVariant &&
    inferredVariant &&
    explicitVariant !== inferredVariant
  ) {
    throw new Error(
      `Conflicting variant selection for ${agentName}: ` +
        `legacy agent name implies "${inferredVariant}" but explicit variant was "${explicitVariant}"`,
    );
  }

  const variants = getDeclaredVariants(entry);
  const candidateVariant =
    explicitVariant ??
    inferredVariant ??
    (applyDefaultVariant ? entry?.defaultVariant : undefined);

  if (!candidateVariant) {
    return undefined;
  }

  if (variants.length > 0) {
    if (!variants.some((variant) => variant.id === candidateVariant)) {
      throw new Error(
        `Unsupported variant "${candidateVariant}" for ${agentName}. Allowed values: ${formatAllowedVariants(
          variants,
        )}`,
      );
    }
    return candidateVariant;
  }

  if (agentName.startsWith("codex/")) {
    if (!isKnownCodexReasoningVariant(candidateVariant)) {
      throw new Error(
        `Unsupported variant "${candidateVariant}" for ${agentName}. Allowed values: ${CODEX_REASONING_VARIANTS.join(
          ", ",
        )}`,
      );
    }
    return candidateVariant;
  }

  throw new Error(`Model ${agentName} does not support effort variants`);
}

export interface SelectedAgentSelection {
  agentName: string;
  selectedVariant?: string;
}

export interface NormalizedAgentSelection {
  requestedAgentName: string;
  assignedAgentName: string;
  selectedVariant?: string;
  catalogEntry?: AgentCatalogEntry;
  variants: ModelVariant[];
  defaultVariant?: string;
}

export function normalizeAgentSelection(options: {
  agentName: string;
  selectedVariant?: string | null;
  applyDefaultVariant?: boolean;
}): NormalizedAgentSelection {
  const requestedAgentName = options.agentName.trim();
  if (!requestedAgentName) {
    throw new Error("Agent name is required");
  }

  const normalized = inferLegacyVariant(requestedAgentName);
  const catalogEntry = findCatalogEntryByName(normalized.baseAgentName);
  const effectiveVariant = resolveRequestedVariant(
    normalized.baseAgentName,
    catalogEntry,
    options.selectedVariant,
    normalized.inferredVariant,
    options.applyDefaultVariant ?? true,
  );

  return {
    requestedAgentName,
    assignedAgentName: normalized.baseAgentName,
    selectedVariant: effectiveVariant,
    catalogEntry,
    variants: getDeclaredVariants(catalogEntry),
    defaultVariant: catalogEntry?.defaultVariant,
  };
}
