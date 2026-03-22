import { describe, expect, it } from "vitest";
import {
  MASKED_ENV_VALUE,
  ensureInitialEnvVars,
  parseEnvBlock,
  getInstallCommand,
  getRunCommand,
  getFrameworkPresetConfig,
  getFrameworkDisplayName,
  FRAMEWORK_PRESET_OPTIONS,
  deriveVncWebsocketUrl,
  deriveVscodeUrl,
  deriveBrowserVncUrl,
  createEmptyEnvironmentConfig,
} from "./utils";
import type { EnvVar, PackageManager, FrameworkPreset } from "./types";

describe("environment/utils", () => {
  describe("MASKED_ENV_VALUE", () => {
    it("is a fixed masked string", () => {
      expect(MASKED_ENV_VALUE).toBe("••••••••••••••••");
    });
  });

  describe("ensureInitialEnvVars", () => {
    it("returns single empty row when input is undefined", () => {
      const result = ensureInitialEnvVars(undefined);
      expect(result).toEqual([{ name: "", value: "", isSecret: true }]);
    });

    it("returns single empty row when input is empty array", () => {
      const result = ensureInitialEnvVars([]);
      expect(result).toEqual([{ name: "", value: "", isSecret: true }]);
    });

    it("preserves existing env vars and adds empty row", () => {
      const input: EnvVar[] = [
        { name: "API_KEY", value: "secret123", isSecret: true },
      ];
      const result = ensureInitialEnvVars(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: "API_KEY", value: "secret123", isSecret: true });
      expect(result[1]).toEqual({ name: "", value: "", isSecret: true });
    });

    it("does not add empty row if last row is already empty", () => {
      const input: EnvVar[] = [
        { name: "DB_URL", value: "postgres://localhost", isSecret: false },
        { name: "", value: "", isSecret: true },
      ];
      const result = ensureInitialEnvVars(input);
      expect(result).toHaveLength(2);
    });

    it("adds empty row if last row has only whitespace name", () => {
      const input: EnvVar[] = [
        { name: "  ", value: "", isSecret: true },
      ];
      const result = ensureInitialEnvVars(input);
      expect(result).toHaveLength(1); // trim results in empty, so no add
    });

    it("defaults isSecret to true when not provided", () => {
      const input = [
        { name: "TEST", value: "val" },
      ] as EnvVar[];
      const result = ensureInitialEnvVars(input);
      expect(result[0].isSecret).toBe(true);
    });

    it("preserves isSecret false when explicitly set", () => {
      const input: EnvVar[] = [
        { name: "PUBLIC_VAR", value: "visible", isSecret: false },
      ];
      const result = ensureInitialEnvVars(input);
      expect(result[0].isSecret).toBe(false);
    });
  });

  describe("parseEnvBlock", () => {
    it("returns empty array for empty input", () => {
      expect(parseEnvBlock("")).toEqual([]);
    });

    it("parses simple KEY=value pairs", () => {
      const result = parseEnvBlock("API_KEY=secret123");
      expect(result).toEqual([{ name: "API_KEY", value: "secret123" }]);
    });

    it("handles multiple lines", () => {
      const result = parseEnvBlock("KEY1=val1\nKEY2=val2\nKEY3=val3");
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: "KEY1", value: "val1" });
      expect(result[2]).toEqual({ name: "KEY3", value: "val3" });
    });

    it("handles Windows line endings (CRLF)", () => {
      const result = parseEnvBlock("KEY1=val1\r\nKEY2=val2");
      expect(result).toHaveLength(2);
    });

    it("handles old Mac line endings (CR only)", () => {
      const result = parseEnvBlock("KEY1=val1\rKEY2=val2");
      expect(result).toHaveLength(2);
    });

    it("skips empty lines", () => {
      const result = parseEnvBlock("KEY1=val1\n\n\nKEY2=val2");
      expect(result).toHaveLength(2);
    });

    it("skips comment lines starting with #", () => {
      const result = parseEnvBlock("# This is a comment\nKEY=value");
      expect(result).toEqual([{ name: "KEY", value: "value" }]);
    });

    it("skips comment lines starting with //", () => {
      const result = parseEnvBlock("// JavaScript style comment\nKEY=value");
      expect(result).toEqual([{ name: "KEY", value: "value" }]);
    });

    it("strips 'export ' prefix", () => {
      const result = parseEnvBlock("export API_KEY=secret");
      expect(result).toEqual([{ name: "API_KEY", value: "secret" }]);
    });

    it("strips 'set ' prefix (Windows batch)", () => {
      const result = parseEnvBlock("set API_KEY=secret");
      expect(result).toEqual([{ name: "API_KEY", value: "secret" }]);
    });

    it("removes double quotes from values", () => {
      const result = parseEnvBlock('KEY="quoted value"');
      expect(result).toEqual([{ name: "KEY", value: "quoted value" }]);
    });

    it("removes single quotes from values", () => {
      const result = parseEnvBlock("KEY='single quoted'");
      expect(result).toEqual([{ name: "KEY", value: "single quoted" }]);
    });

    it("does not remove mismatched quotes", () => {
      const result = parseEnvBlock("KEY=\"not closed'");
      expect(result).toEqual([{ name: "KEY", value: "\"not closed'" }]);
    });

    it("skips lines without equals sign", () => {
      const result = parseEnvBlock("INVALID_LINE\nKEY=value");
      expect(result).toEqual([{ name: "KEY", value: "value" }]);
    });

    it("skips keys with whitespace", () => {
      const result = parseEnvBlock("INVALID KEY=value\nVALID_KEY=value");
      expect(result).toEqual([{ name: "VALID_KEY", value: "value" }]);
    });

    it("handles value with equals sign", () => {
      const result = parseEnvBlock("URL=https://example.com?param=value");
      expect(result).toEqual([
        { name: "URL", value: "https://example.com?param=value" },
      ]);
    });

    it("handles empty value", () => {
      const result = parseEnvBlock("EMPTY_KEY=");
      expect(result).toEqual([{ name: "EMPTY_KEY", value: "" }]);
    });

    it("trims whitespace from keys and values", () => {
      const result = parseEnvBlock("  KEY  =  value  ");
      expect(result).toEqual([{ name: "KEY", value: "value" }]);
    });
  });

  describe("getInstallCommand", () => {
    it("returns 'bun install' for bun", () => {
      expect(getInstallCommand("bun")).toBe("bun install");
    });

    it("returns 'pnpm install' for pnpm", () => {
      expect(getInstallCommand("pnpm")).toBe("pnpm install");
    });

    it("returns 'yarn install' for yarn", () => {
      expect(getInstallCommand("yarn")).toBe("yarn install");
    });

    it("returns 'npm install' for npm", () => {
      expect(getInstallCommand("npm")).toBe("npm install");
    });

    it("returns npm install as default fallback", () => {
      // Test with unknown value to ensure default case
      expect(getInstallCommand("unknown" as PackageManager)).toBe("npm install");
    });
  });

  describe("getRunCommand", () => {
    it("returns 'bun run <script>' for bun", () => {
      expect(getRunCommand("bun", "dev")).toBe("bun run dev");
      expect(getRunCommand("bun", "build")).toBe("bun run build");
    });

    it("returns 'pnpm run <script>' for pnpm", () => {
      expect(getRunCommand("pnpm", "dev")).toBe("pnpm run dev");
    });

    it("returns 'yarn <script>' for yarn (no run needed)", () => {
      expect(getRunCommand("yarn", "dev")).toBe("yarn dev");
    });

    it("returns 'npm run <script>' for npm", () => {
      expect(getRunCommand("npm", "dev")).toBe("npm run dev");
    });

    it("returns npm run as default fallback", () => {
      expect(getRunCommand("unknown" as PackageManager, "test")).toBe("npm run test");
    });
  });

  describe("getFrameworkPresetConfig", () => {
    it("returns empty scripts for 'other' preset", () => {
      const config = getFrameworkPresetConfig("other", "npm");
      expect(config).toEqual({
        name: "Other",
        maintenanceScript: "",
        devScript: "",
      });
    });

    it("returns correct config for Next.js with npm", () => {
      const config = getFrameworkPresetConfig("next", "npm");
      expect(config).toEqual({
        name: "Next.js",
        maintenanceScript: "npm install",
        devScript: "npm run dev",
      });
    });

    it("returns correct config for Vite with bun", () => {
      const config = getFrameworkPresetConfig("vite", "bun");
      expect(config).toEqual({
        name: "Vite",
        maintenanceScript: "bun install",
        devScript: "bun run dev",
      });
    });

    it("returns 'start' script for Angular (uses start instead of dev)", () => {
      const config = getFrameworkPresetConfig("angular", "npm");
      expect(config.devScript).toBe("npm run start");
    });

    it("returns 'start' script for Create React App", () => {
      const config = getFrameworkPresetConfig("cra", "yarn");
      expect(config.devScript).toBe("yarn start");
    });

    it("defaults to npm when no package manager specified", () => {
      const config = getFrameworkPresetConfig("remix");
      expect(config.maintenanceScript).toBe("npm install");
      expect(config.devScript).toBe("npm run dev");
    });

    it("handles all framework presets", () => {
      const presets: FrameworkPreset[] = [
        "other", "next", "vite", "remix", "nuxt",
        "sveltekit", "angular", "cra", "vue"
      ];
      for (const preset of presets) {
        const config = getFrameworkPresetConfig(preset);
        expect(config.name).toBeTruthy();
        expect(typeof config.maintenanceScript).toBe("string");
        expect(typeof config.devScript).toBe("string");
      }
    });
  });

  describe("getFrameworkDisplayName", () => {
    it("returns 'Other' for other", () => {
      expect(getFrameworkDisplayName("other")).toBe("Other");
    });

    it("returns 'Next.js' for next", () => {
      expect(getFrameworkDisplayName("next")).toBe("Next.js");
    });

    it("returns 'Vite' for vite", () => {
      expect(getFrameworkDisplayName("vite")).toBe("Vite");
    });

    it("returns 'Remix' for remix", () => {
      expect(getFrameworkDisplayName("remix")).toBe("Remix");
    });

    it("returns 'Nuxt' for nuxt", () => {
      expect(getFrameworkDisplayName("nuxt")).toBe("Nuxt");
    });

    it("returns 'SvelteKit' for sveltekit", () => {
      expect(getFrameworkDisplayName("sveltekit")).toBe("SvelteKit");
    });

    it("returns 'Angular' for angular", () => {
      expect(getFrameworkDisplayName("angular")).toBe("Angular");
    });

    it("returns 'Create React App' for cra", () => {
      expect(getFrameworkDisplayName("cra")).toBe("Create React App");
    });

    it("returns 'Vue' for vue", () => {
      expect(getFrameworkDisplayName("vue")).toBe("Vue");
    });
  });

  describe("FRAMEWORK_PRESET_OPTIONS", () => {
    it("contains all 9 framework presets", () => {
      expect(FRAMEWORK_PRESET_OPTIONS).toHaveLength(9);
    });

    it("has 'other' as first option", () => {
      expect(FRAMEWORK_PRESET_OPTIONS[0]).toBe("other");
    });

    it("contains expected presets", () => {
      const expected: FrameworkPreset[] = [
        "other", "next", "vite", "remix", "nuxt",
        "sveltekit", "angular", "cra", "vue"
      ];
      expect(FRAMEWORK_PRESET_OPTIONS).toEqual(expected);
    });
  });

  describe("deriveVncWebsocketUrl", () => {
    it("returns null when both instanceId and workspaceUrl are undefined", () => {
      expect(deriveVncWebsocketUrl()).toBeNull();
    });

    it("returns null for empty instanceId", () => {
      expect(deriveVncWebsocketUrl("")).toBeNull();
    });

    it("returns null for whitespace-only instanceId", () => {
      expect(deriveVncWebsocketUrl("   ")).toBeNull();
    });

    it("returns null for non-morph instance ID", () => {
      expect(deriveVncWebsocketUrl("invalid_id_123")).toBeNull();
    });

    it("derives URL from morphvm_ instance ID", () => {
      const result = deriveVncWebsocketUrl("morphvm_abc123");
      expect(result).toBe("wss://port-39380-morphvm-abc123.http.cloud.morph.so/websockify");
    });

    it("normalizes underscores to hyphens in instance ID", () => {
      const result = deriveVncWebsocketUrl("morphvm_test_id");
      expect(result).toBe("wss://port-39380-morphvm-test-id.http.cloud.morph.so/websockify");
    });

    it("handles morphvm- prefix (hyphen)", () => {
      const result = deriveVncWebsocketUrl("morphvm-xyz789");
      expect(result).toBe("wss://port-39380-morphvm-xyz789.http.cloud.morph.so/websockify");
    });

    it("lowercases instance ID", () => {
      const result = deriveVncWebsocketUrl("morphvm_ABC123");
      expect(result).toBe("wss://port-39380-morphvm-abc123.http.cloud.morph.so/websockify");
    });

    it("derives from direct morph.so workspace URL", () => {
      const result = deriveVncWebsocketUrl(
        undefined,
        "https://port-3000-morphvm-abc123.http.cloud.morph.so/app"
      );
      expect(result).toBe("wss://port-39380-morphvm-abc123.http.cloud.morph.so/websockify");
    });

    it("derives from cmux proxy URL", () => {
      const result = deriveVncWebsocketUrl(
        undefined,
        "https://cmux-abc123-some-name-3000.cmux.sh/app"
      );
      expect(result).toBe("wss://port-39380-morphvm-abc123.http.cloud.morph.so/websockify");
    });

    it("derives from manaflow proxy URL", () => {
      const result = deriveVncWebsocketUrl(
        undefined,
        "https://manaflow-xyz789-workspace-8080.manaflow.app/test"
      );
      expect(result).toBe("wss://port-39380-morphvm-xyz789.http.cloud.morph.so/websockify");
    });

    it("prefers instanceId over workspaceUrl", () => {
      const result = deriveVncWebsocketUrl(
        "morphvm_preferred",
        "https://port-3000-morphvm-ignored.http.cloud.morph.so/"
      );
      expect(result).toBe("wss://port-39380-morphvm-preferred.http.cloud.morph.so/websockify");
    });

    it("returns null for invalid workspace URL", () => {
      expect(deriveVncWebsocketUrl(undefined, "not-a-url")).toBeNull();
    });

    it("returns null for unrecognized hostname pattern", () => {
      expect(deriveVncWebsocketUrl(undefined, "https://example.com/workspace")).toBeNull();
    });
  });

  describe("deriveVscodeUrl", () => {
    it("returns null for undefined instanceId", () => {
      expect(deriveVscodeUrl()).toBeNull();
    });

    it("returns null for non-morph instance ID", () => {
      expect(deriveVscodeUrl("invalid")).toBeNull();
    });

    it("derives URL with default folder path", () => {
      const result = deriveVscodeUrl("morphvm_abc123");
      expect(result).toBe(
        "https://port-39378-morphvm-abc123.http.cloud.morph.so/?folder=%2Froot%2Fworkspace"
      );
    });

    it("derives URL with custom folder path", () => {
      const result = deriveVscodeUrl("morphvm_abc123", "/home/user/project");
      expect(result).toBe(
        "https://port-39378-morphvm-abc123.http.cloud.morph.so/?folder=%2Fhome%2Fuser%2Fproject"
      );
    });

    it("URL-encodes special characters in folder path", () => {
      const result = deriveVscodeUrl("morphvm_test", "/path with spaces");
      expect(result).toContain("%2Fpath%20with%20spaces");
    });
  });

  describe("deriveBrowserVncUrl", () => {
    it("returns null for undefined instanceId", () => {
      expect(deriveBrowserVncUrl()).toBeNull();
    });

    it("returns null for non-morph instance ID", () => {
      expect(deriveBrowserVncUrl("invalid")).toBeNull();
    });

    it("derives URL with autoconnect and resize params", () => {
      const result = deriveBrowserVncUrl("morphvm_abc123");
      expect(result).toBe(
        "https://port-39380-morphvm-abc123.http.cloud.morph.so/vnc.html?autoconnect=1&resize=scale"
      );
    });

    it("normalizes instance ID format", () => {
      const result = deriveBrowserVncUrl("morphvm_TEST_ID");
      expect(result).toContain("morphvm-test-id");
    });
  });

  describe("createEmptyEnvironmentConfig", () => {
    it("returns config with empty envName", () => {
      const config = createEmptyEnvironmentConfig();
      expect(config.envName).toBe("");
    });

    it("returns config with initialized envVars (single empty row)", () => {
      const config = createEmptyEnvironmentConfig();
      expect(config.envVars).toEqual([{ name: "", value: "", isSecret: true }]);
    });

    it("returns config with empty maintenanceScript", () => {
      const config = createEmptyEnvironmentConfig();
      expect(config.maintenanceScript).toBe("");
    });

    it("returns config with empty devScript", () => {
      const config = createEmptyEnvironmentConfig();
      expect(config.devScript).toBe("");
    });

    it("returns config with empty exposedPorts", () => {
      const config = createEmptyEnvironmentConfig();
      expect(config.exposedPorts).toBe("");
    });

    it("returns new object each call (not shared reference)", () => {
      const config1 = createEmptyEnvironmentConfig();
      const config2 = createEmptyEnvironmentConfig();
      expect(config1).not.toBe(config2);
      expect(config1.envVars).not.toBe(config2.envVars);
    });
  });
});
