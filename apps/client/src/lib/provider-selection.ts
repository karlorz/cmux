export type ProviderStatusLike = {
  name: string;
  isAvailable: boolean;
};

export type PruneKnownAgentsResult = {
  filteredAgents: string[];
  unavailableKnown: string[];
  unknownMissing: string[];
};

export function pruneKnownAgentsByProviderStatus(options: {
  agents: string[];
  providers: ProviderStatusLike[];
}): PruneKnownAgentsResult {
  const providerByName = new Map(options.providers.map((p) => [p.name, p]));
  const filteredAgents: string[] = [];
  const unavailableKnown: string[] = [];
  const unknownMissing: string[] = [];

  for (const agent of options.agents) {
    const provider = providerByName.get(agent);
    if (!provider) {
      unknownMissing.push(agent);
      continue;
    }
    if (!provider.isAvailable) {
      unavailableKnown.push(agent);
      continue;
    }
    filteredAgents.push(agent);
  }

  return { filteredAgents, unavailableKnown, unknownMissing };
}

export type AgentSelectionWarning = {
  kind: "unavailableKnown" | "unknownMissing";
  message: string;
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function buildAgentSelectionWarnings(options: {
  unavailableKnown: string[];
  unknownMissing: string[];
  isWebMode: boolean;
}): AgentSelectionWarning[] {
  const warnings: AgentSelectionWarning[] = [];

  if (options.unavailableKnown.length > 0) {
    const uniqueMissing = uniq(options.unavailableKnown);
    const label = uniqueMissing.length === 1 ? "model" : "models";
    const verb = uniqueMissing.length === 1 ? "is" : "are";
    const thisThese = uniqueMissing.length === 1 ? "this" : "these";
    const actionMessage = options.isWebMode
      ? `Add your API keys in Settings to use ${thisThese} ${label}.`
      : `Update credentials in Settings to use ${thisThese} ${label}.`;
    warnings.push({
      kind: "unavailableKnown",
      message: `${uniqueMissing.join(", ")} ${verb} not configured and was removed from the selection. ${actionMessage}`,
    });
  }

  if (options.unknownMissing.length > 0) {
    const uniqueMissing = uniq(options.unknownMissing);
    const verb = uniqueMissing.length === 1 ? "was" : "were";
    const thisThese =
      uniqueMissing.length === 1 ? "this model" : "these models";
    warnings.push({
      kind: "unknownMissing",
      message: `${uniqueMissing.join(", ")} ${verb} removed from the selection because the server didn't report a status for ${thisThese}. This usually means the client and server are on different versions — refresh or redeploy the server.`,
    });
  }

  return warnings;
}
