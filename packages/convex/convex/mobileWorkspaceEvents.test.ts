import { describe, expect, it } from "vitest";
import { selectPushTargets } from "./mobileWorkspaceEvents";
import type { Doc, Id } from "./_generated/dataModel";

type DevicePushTokenDoc = Doc<"devicePushTokens">;

function createToken(
  overrides: Partial<DevicePushTokenDoc> = {}
): DevicePushTokenDoc {
  return {
    _id: "id1" as Id<"devicePushTokens">,
    _creationTime: Date.now(),
    teamId: "team-1",
    userId: "user-1",
    deviceId: "device-1",
    token: "token-abc123",
    bundleId: "com.example.app",
    platform: "ios",
    environment: "production",
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("selectPushTargets", () => {
  describe("basic behavior", () => {
    it("returns empty array for empty input", () => {
      const result = selectPushTargets([]);
      expect(result).toEqual([]);
    });

    it("returns single token as push target", () => {
      const token = createToken();
      const result = selectPushTargets([token]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        token: token.token,
        environment: token.environment,
        bundleId: token.bundleId,
        deviceId: token.deviceId,
      });
    });

    it("returns multiple distinct tokens", () => {
      const tokens = [
        createToken({ deviceId: "device-1", token: "token-1" }),
        createToken({ deviceId: "device-2", token: "token-2" }),
      ];
      const result = selectPushTargets(tokens);

      expect(result).toHaveLength(2);
    });
  });

  describe("deduplication", () => {
    it("deduplicates tokens with same token:bundleId:environment", () => {
      const tokens = [
        createToken({
          _id: "id1" as Id<"devicePushTokens">,
          deviceId: "device-1",
          token: "same-token",
          bundleId: "com.app",
          environment: "production",
        }),
        createToken({
          _id: "id2" as Id<"devicePushTokens">,
          deviceId: "device-2",
          token: "same-token",
          bundleId: "com.app",
          environment: "production",
        }),
      ];

      const result = selectPushTargets(tokens);

      // Should only have one entry (last one wins due to Map)
      expect(result).toHaveLength(1);
      expect(result[0].token).toBe("same-token");
    });

    it("keeps tokens with different bundleIds", () => {
      const tokens = [
        createToken({
          token: "token-1",
          bundleId: "com.app.dev",
          environment: "production",
        }),
        createToken({
          token: "token-1",
          bundleId: "com.app.prod",
          environment: "production",
        }),
      ];

      const result = selectPushTargets(tokens);

      expect(result).toHaveLength(2);
    });

    it("keeps tokens with different environments", () => {
      const tokens = [
        createToken({
          token: "token-1",
          bundleId: "com.app",
          environment: "development",
        }),
        createToken({
          token: "token-1",
          bundleId: "com.app",
          environment: "production",
        }),
      ];

      const result = selectPushTargets(tokens);

      expect(result).toHaveLength(2);
    });

    it("keeps tokens with different token values", () => {
      const tokens = [
        createToken({
          token: "token-aaa",
          bundleId: "com.app",
          environment: "production",
        }),
        createToken({
          token: "token-bbb",
          bundleId: "com.app",
          environment: "production",
        }),
      ];

      const result = selectPushTargets(tokens);

      expect(result).toHaveLength(2);
    });
  });

  describe("device exclusion", () => {
    it("excludes specified device when excludedDeviceId is provided", () => {
      const tokens = [
        createToken({ deviceId: "device-1", token: "token-1" }),
        createToken({ deviceId: "device-2", token: "token-2" }),
        createToken({ deviceId: "device-3", token: "token-3" }),
      ];

      const result = selectPushTargets(tokens, "device-2");

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.deviceId)).not.toContain("device-2");
      expect(result.map((t) => t.deviceId)).toContain("device-1");
      expect(result.map((t) => t.deviceId)).toContain("device-3");
    });

    it("excludes all tokens from the specified device", () => {
      const tokens = [
        createToken({
          deviceId: "device-1",
          token: "token-1a",
          bundleId: "com.app.a",
        }),
        createToken({
          deviceId: "device-1",
          token: "token-1b",
          bundleId: "com.app.b",
        }),
        createToken({ deviceId: "device-2", token: "token-2" }),
      ];

      const result = selectPushTargets(tokens, "device-1");

      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe("device-2");
    });

    it("returns all tokens when excludedDeviceId is undefined", () => {
      const tokens = [
        createToken({ deviceId: "device-1", token: "token-1" }),
        createToken({ deviceId: "device-2", token: "token-2" }),
      ];

      const result = selectPushTargets(tokens, undefined);

      expect(result).toHaveLength(2);
    });

    it("returns all tokens when excludedDeviceId does not match any", () => {
      const tokens = [
        createToken({ deviceId: "device-1", token: "token-1" }),
        createToken({ deviceId: "device-2", token: "token-2" }),
      ];

      const result = selectPushTargets(tokens, "device-nonexistent");

      expect(result).toHaveLength(2);
    });

    it("returns empty array when only device is excluded", () => {
      const tokens = [createToken({ deviceId: "device-1", token: "token-1" })];

      const result = selectPushTargets(tokens, "device-1");

      expect(result).toEqual([]);
    });
  });

  describe("combined exclusion and deduplication", () => {
    it("excludes device before deduplication", () => {
      const tokens = [
        createToken({
          deviceId: "device-1",
          token: "same-token",
          bundleId: "com.app",
          environment: "production",
        }),
        createToken({
          deviceId: "device-2",
          token: "same-token",
          bundleId: "com.app",
          environment: "production",
        }),
      ];

      // Exclude device-1, should still have device-2's token
      const result = selectPushTargets(tokens, "device-1");

      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe("device-2");
    });
  });

  describe("output format", () => {
    it("returns only required fields in output", () => {
      const token = createToken({
        _id: "custom-id" as Id<"devicePushTokens">,
        _creationTime: 12345,
        teamId: "team-xyz",
        userId: "user-abc",
        deviceId: "device-123",
        token: "apns-token",
        bundleId: "com.example.app",
        environment: "production",
        updatedAt: 67890,
      });

      const result = selectPushTargets([token]);

      expect(result[0]).toEqual({
        token: "apns-token",
        environment: "production",
        bundleId: "com.example.app",
        deviceId: "device-123",
      });

      // Ensure internal fields are not included
      expect(result[0]).not.toHaveProperty("_id");
      expect(result[0]).not.toHaveProperty("_creationTime");
      expect(result[0]).not.toHaveProperty("teamId");
      expect(result[0]).not.toHaveProperty("userId");
      expect(result[0]).not.toHaveProperty("updatedAt");
    });
  });
});
