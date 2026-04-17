import { api } from "@cmux/convex/api";
import {
  hasAnthropicCustomEndpointConfigured,
  requiresAnthropicCustomEndpoint,
} from "@cmux/shared/providers/anthropic/models";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

type AvailableModelEntry = {
  name: string;
  tier: "free" | "paid";
  requiredApiKeys?: string[];
};

export function useTeamModelCatalog(teamSlugOrId: string) {
  const {
    data: models,
    refetch: refetchModels,
    isLoading,
  } = useQuery(convexQuery(api.models.listAll, { teamSlugOrId }));

  const ensureModelsSeeded = useAction(api.modelDiscovery.ensureModelsSeeded);
  const hasTriedSeeding = useRef(false);

  useEffect(() => {
    if (hasTriedSeeding.current || isLoading) {
      return;
    }

    if (models && models.length > 0) {
      return;
    }

    hasTriedSeeding.current = true;
    console.log("[useTeamModelCatalog] No models found, triggering auto-seed...");
    ensureModelsSeeded({ teamSlugOrId })
      .then((result) => {
        if (result.seeded) {
          console.log(
            `[useTeamModelCatalog] Auto-seeded ${result.count} models`,
          );
          void refetchModels();
        }
      })
      .catch((error) => {
        console.error("[useTeamModelCatalog] Auto-seed failed:", error);
      });
  }, [ensureModelsSeeded, isLoading, models, refetchModels, teamSlugOrId]);

  return {
    models,
    refetchModels,
    isLoading,
  };
}

export function useModelAvailability(teamSlugOrId: string) {
  const { data: apiKeys } = useQuery(
    convexQuery(api.apiKeys.getAll, { teamSlugOrId }),
  );
  const { data: workspaceSettings } = useQuery(
    convexQuery(api.workspaceSettings.get, { teamSlugOrId }),
  );
  const { data: anthropicOverride } = useQuery(
    convexQuery(api.providerOverrides.getByProvider, {
      teamSlugOrId,
      providerId: "anthropic",
    }),
  );

  const configuredApiKeys = useMemo(() => {
    return new Set((apiKeys ?? []).map((key) => key.envVar));
  }, [apiKeys]);

  const hasAnthropicCustomEndpoint = useMemo(
    () =>
      hasAnthropicCustomEndpointConfigured({
        apiKeys: {
          ANTHROPIC_BASE_URL: apiKeys?.find(
            (key) => key.envVar === "ANTHROPIC_BASE_URL",
          )?.value,
        },
        bypassAnthropicProxy: workspaceSettings?.bypassAnthropicProxy ?? false,
        providerOverrides: anthropicOverride
          ? [
              {
                providerId: anthropicOverride.providerId,
                enabled: anthropicOverride.enabled,
                baseUrl: anthropicOverride.baseUrl,
                apiFormat: anthropicOverride.apiFormat,
              },
            ]
          : [],
      }),
    [
      anthropicOverride,
      apiKeys,
      workspaceSettings?.bypassAnthropicProxy,
    ],
  );

  const isModelAvailable = useCallback(
    (model: AvailableModelEntry) => {
      if (
        requiresAnthropicCustomEndpoint(model.name) &&
        !hasAnthropicCustomEndpoint
      ) {
        return false;
      }

      if (model.tier === "free") {
        return true;
      }

      const requiredApiKeys = model.requiredApiKeys ?? [];
      if (requiredApiKeys.length === 0) {
        return true;
      }

      return requiredApiKeys.some((requiredKey) =>
        configuredApiKeys.has(requiredKey),
      );
    },
    [configuredApiKeys, hasAnthropicCustomEndpoint],
  );

  return {
    isModelAvailable,
  };
}
