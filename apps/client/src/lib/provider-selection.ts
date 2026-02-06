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
  kind: "unavailableKnown" | "unknownMissing" | "versionDrift";
  message: string;
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export type ProviderDiagnostics = {
  legacyCodexPresent?: boolean;
  modelRegistryFingerprint?: string;
  serverBuildId?: string;
  codexKeyPresence?: {
    hasOpenaiApiKey: boolean;
    hasCodexAuthJson: boolean;
  };
};

export function buildAgentSelectionWarnings(options: {
  unavailableKnown: string[];
  unknownMissing: string[];
  isWebMode: boolean;
  diagnostics?: ProviderDiagnostics;
}): AgentSelectionWarning[] {
  const warnings: AgentSelectionWarning[] = [];

  if (options.unavailableKnown.length > 0) {
    const uniqueMissing = uniq(options.unavailableKnown);
    const label = uniqueMissing.length === 1 ? "model" : "models";
    const verb = uniqueMissing.length === 1 ? "is" : "are";
    const thisThese = uniqueMissing.length === 1 ? "this" : "these";

    // Check for potential key-source mismatch in web mode
    const codexModels = uniqueMissing.filter((m) => m.startsWith("codex/"));
    const { diagnostics } = options;
    if (
      options.isWebMode &&
      codexModels.length > 0 &&
      diagnostics?.codexKeyPresence
    ) {
      const { hasOpenaiApiKey, hasCodexAuthJson } = diagnostics.codexKeyPresence;
      if (!hasOpenaiApiKey && !hasCodexAuthJson) {
        warnings.push({
          kind: "unavailableKnown",
          message: `${uniqueMissing.join(", ")} ${verb} not configured. Add your OpenAI API Key or Codex Auth JSON in Settings to use ${thisThese} ${label}.`,
        });
        return warnings;
      }
    }

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

    // Check if this looks like version drift
    const { diagnostics } = options;
    const hasVersionDrift =
      diagnostics?.legacyCodexPresent === true ||
      (uniqueMissing.some((m) => m.includes("codex/gpt-5.3")) &&
        !diagnostics?.modelRegistryFingerprint);

    if (hasVersionDrift) {
      const buildInfo = diagnostics?.serverBuildId
        ? ` (server build: ${diagnostics.serverBuildId})`
        : "";
      warnings.push({
        kind: "versionDrift",
        message: `${uniqueMissing.join(", ")} ${verb} removed because the server is running an older version${buildInfo}. The client expects models that the server doesn't have. Redeploy the server to fix this.`,
      });
    } else {
      warnings.push({
        kind: "unknownMissing",
        message: `${uniqueMissing.join(", ")} ${verb} removed from the selection because the server didn't report a status for ${thisThese}. This usually means the client and server are on different versions - refresh or redeploy the server.`,
      });
    }
  }

  return warnings;
}
