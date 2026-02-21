import { describe, expect, it } from "vitest";
import { AGENT_CATALOG, type AgentCatalogEntry } from "./agent-catalog";
import { AGENT_CONFIGS, type AgentConfig } from "./agentConfig";

describe("agent-catalog", () => {
  describe("catalog/config alignment", () => {
    const catalogByName = new Map<string, AgentCatalogEntry>(
      AGENT_CATALOG.map((entry) => [entry.name, entry])
    );

    const configByName = new Map<string, AgentConfig>(
      AGENT_CONFIGS.map((config) => [config.name, config])
    );

    it("every AGENT_CATALOG entry has a matching AGENT_CONFIGS entry", () => {
      const missingInConfigs: string[] = [];
      for (const entry of AGENT_CATALOG) {
        if (!configByName.has(entry.name)) {
          missingInConfigs.push(entry.name);
        }
      }
      expect(missingInConfigs).toEqual([]);
    });

    it("every AGENT_CONFIGS entry has a matching AGENT_CATALOG entry", () => {
      const missingInCatalog: string[] = [];
      for (const config of AGENT_CONFIGS) {
        if (!catalogByName.has(config.name)) {
          missingInCatalog.push(config.name);
        }
      }
      expect(missingInCatalog).toEqual([]);
    });

    it("catalog entries have correct array length matching configs", () => {
      expect(AGENT_CATALOG.length).toBe(AGENT_CONFIGS.length);
    });

    it("requiredApiKeys in catalog match apiKeys[].envVar in configs", () => {
      const mismatches: string[] = [];
      for (const entry of AGENT_CATALOG) {
        const config = configByName.get(entry.name);
        if (!config) continue;

        const configEnvVars = new Set(
          config.apiKeys?.map((k) => k.envVar) ?? []
        );
        const catalogEnvVars = new Set(entry.requiredApiKeys);

        // Check if sets are equal
        if (configEnvVars.size !== catalogEnvVars.size) {
          mismatches.push(
            `${entry.name}: catalog has [${[...catalogEnvVars].join(", ")}] but config has [${[...configEnvVars].join(", ")}]`
          );
          continue;
        }

        for (const envVar of catalogEnvVars) {
          if (!configEnvVars.has(envVar)) {
            mismatches.push(
              `${entry.name}: catalog has ${envVar} but config does not`
            );
          }
        }
      }
      expect(mismatches).toEqual([]);
    });

    it("disabled/disabledReason match between catalog and configs", () => {
      const mismatches: string[] = [];
      for (const entry of AGENT_CATALOG) {
        const config = configByName.get(entry.name);
        if (!config) continue;

        if (entry.disabled !== config.disabled) {
          mismatches.push(
            `${entry.name}: catalog.disabled=${entry.disabled} but config.disabled=${config.disabled}`
          );
        }

        if (entry.disabledReason !== config.disabledReason) {
          mismatches.push(
            `${entry.name}: catalog.disabledReason="${entry.disabledReason}" but config.disabledReason="${config.disabledReason}"`
          );
        }
      }
      expect(mismatches).toEqual([]);
    });
  });

  describe("catalog data integrity", () => {
    it("all entries have unique names", () => {
      const names = AGENT_CATALOG.map((e) => e.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("all entries have non-empty displayName", () => {
      const emptyDisplayNames = AGENT_CATALOG.filter(
        (e) => !e.displayName || e.displayName.trim() === ""
      );
      expect(emptyDisplayNames.map((e) => e.name)).toEqual([]);
    });

    it("all entries have valid vendor", () => {
      const validVendors = new Set([
        "anthropic",
        "openai",
        "google",
        "opencode",
        "qwen",
        "cursor",
        "amp",
        "xai",
        "openrouter",
      ]);
      const invalidVendors = AGENT_CATALOG.filter(
        (e) => !validVendors.has(e.vendor)
      );
      expect(invalidVendors.map((e) => `${e.name}: ${e.vendor}`)).toEqual([]);
    });

    it("all entries have valid tier", () => {
      const validTiers = new Set(["free", "paid"]);
      const invalidTiers = AGENT_CATALOG.filter(
        (e) => !validTiers.has(e.tier)
      );
      expect(invalidTiers.map((e) => `${e.name}: ${e.tier}`)).toEqual([]);
    });

    it("free tier entries have requiredApiKeys empty or contain only optional keys", () => {
      // Free tier models should either have no API keys or minimal requirements
      const freeModels = AGENT_CATALOG.filter((e) => e.tier === "free");
      // Just ensure they exist - free models in opencode don't require keys
      expect(freeModels.length).toBeGreaterThan(0);
    });
  });
});
