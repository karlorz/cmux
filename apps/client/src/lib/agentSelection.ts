import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";

export type ProviderAvailability = {
  name: string;
  isAvailable: boolean;
};

export type AgentSelectionReconcileResult = {
  filteredAgents: string[];
  removedUnknownClient: string[];
  removedUnavailableKnown: string[];
  removedUnknownMissing: string[];
};

const KNOWN_AGENT_NAMES = new Set(AGENT_CONFIGS.map((agent) => agent.name));
const DISABLED_AGENT_NAMES = new Set(
  AGENT_CONFIGS.filter((agent) => agent.disabled).map((agent) => agent.name)
);

export const filterKnownAgents = (agents: string[]): string[] =>
  agents.filter(
    (agent) => KNOWN_AGENT_NAMES.has(agent) && !DISABLED_AGENT_NAMES.has(agent)
  );

export function reconcileAgentSelection(
  currentAgents: string[],
  providers?: ProviderAvailability[]
): AgentSelectionReconcileResult {
  const normalizedAgents = filterKnownAgents(currentAgents);
  const normalizedSet = new Set(normalizedAgents);
  const removedUnknownClient = Array.from(
    new Set(currentAgents.filter((agent) => !normalizedSet.has(agent)))
  );

  if (!providers) {
    return {
      filteredAgents: normalizedAgents,
      removedUnknownClient,
      removedUnavailableKnown: [],
      removedUnknownMissing: [],
    };
  }

  const providerNames = new Set(providers.map((provider) => provider.name));
  const availableNames = new Set(
    providers.filter((provider) => provider.isAvailable).map((provider) => provider.name)
  );

  const removedUnknownMissing = Array.from(
    new Set(normalizedAgents.filter((agent) => !providerNames.has(agent)))
  );
  const removedUnavailableKnown = Array.from(
    new Set(
      normalizedAgents.filter(
        (agent) => providerNames.has(agent) && !availableNames.has(agent)
      )
    )
  );

  const filteredAgents = normalizedAgents.filter((agent) =>
    availableNames.has(agent)
  );

  return {
    filteredAgents,
    removedUnknownClient,
    removedUnavailableKnown,
    removedUnknownMissing,
  };
}
