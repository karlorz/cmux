import { describe, expect, it } from "vitest";
import { getActiveSandboxProvider } from "./provider-config";

describe("provider-config", () => {
  it("resolves morph when only MORPH_API_KEY is set", () => {
    const config = getActiveSandboxProvider({ MORPH_API_KEY: "morph_123" });
    expect(config).toEqual({ provider: "morph", apiKey: "morph_123" });
  });

  it("resolves pve-lxc when only PVE env vars are set", () => {
    const config = getActiveSandboxProvider({
      PVE_API_URL: "https://pve.example.com",
      PVE_API_TOKEN: "token",
      PVE_NODE: "pve",
    });

    expect(config).toEqual({
      provider: "pve-lxc",
      apiUrl: "https://pve.example.com",
      apiToken: "token",
      node: "pve",
    });
  });

  it("prefers morph when both providers are available and no explicit provider is set", () => {
    const config = getActiveSandboxProvider({
      MORPH_API_KEY: "morph_123",
      PVE_API_URL: "https://pve.example.com",
      PVE_API_TOKEN: "token",
    });

    expect(config.provider).toBe("morph");
  });

  it("throws when explicit provider requirements are missing", () => {
    expect(() =>
      getActiveSandboxProvider({ SANDBOX_PROVIDER: "pve-lxc", PVE_API_URL: "https://pve.example.com" }),
    ).toThrow(/PVE_API_URL or PVE_API_TOKEN/);
  });

  it("throws when no provider is configured", () => {
    expect(() => getActiveSandboxProvider({})).toThrow(/No sandbox provider configured/);
  });
});
