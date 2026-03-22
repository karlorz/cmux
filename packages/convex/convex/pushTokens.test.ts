import { describe, expect, it } from "vitest";
import { reconcilePushTokenRows } from "./pushTokens";
import type { Doc } from "./_generated/dataModel";

type DevicePushTokenDoc = Doc<"devicePushTokens">;

// Factory to create mock docs with proper Convex Id types
const createMockDoc = (
  overrides: Partial<Omit<DevicePushTokenDoc, "_id" | "_creationTime">> & {
    _id?: string;
  } = {}
): DevicePushTokenDoc => {
  const id = overrides._id ?? `id_${Math.random().toString(36).slice(2, 8)}`;
  const { _id: _, ...rest } = overrides;
  return {
    _id: id as DevicePushTokenDoc["_id"],
    _creationTime: Date.now(),
    token: "push_token_default",
    environment: "production",
    bundleId: "com.example.app",
    platform: "ios",
    teamId: "team_1",
    userId: "user_1",
    updatedAt: Date.now(),
    ...rest,
  };
};

describe("pushTokens", () => {
  describe("reconcilePushTokenRows", () => {
    describe("empty existing rows", () => {
      it("returns null canonical with no duplicates for empty existing rows", () => {
        const result = reconcilePushTokenRows([], {
          token: "new_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toBeNull();
        expect(result.duplicateIds).toEqual([]);
      });
    });

    describe("token matching", () => {
      it("finds canonical by matching token", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "matching_token",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "matching_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toEqual(existing);
        expect(result.duplicateIds).toEqual([]);
      });

      it("requires bundleId to match for token match", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "matching_token",
          bundleId: "com.other.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "matching_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toBeNull();
      });

      it("requires environment to match for token match", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "matching_token",
          bundleId: "com.example.app",
          environment: "development",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "matching_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toBeNull();
      });
    });

    describe("deviceId matching", () => {
      it("finds canonical by matching deviceId when token doesn't match", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "old_token",
          deviceId: "device_123",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "new_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          deviceId: "device_123",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toEqual(existing);
        expect(result.duplicateIds).toEqual([]);
      });

      it("ignores deviceId matching when incoming deviceId is undefined", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "old_token",
          deviceId: "device_123",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "new_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          // no deviceId
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toBeNull();
      });

      it("requires bundleId to match for deviceId match", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "old_token",
          deviceId: "device_123",
          bundleId: "com.other.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "new_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          deviceId: "device_123",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toBeNull();
      });

      it("requires environment to match for deviceId match", () => {
        const existing = createMockDoc({ 
          _id: "id_1", 
          token: "old_token",
          deviceId: "device_123",
          bundleId: "com.example.app",
          environment: "development",
        });
        
        const result = reconcilePushTokenRows([existing], {
          token: "new_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          deviceId: "device_123",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toBeNull();
      });
    });

    describe("duplicate handling", () => {
      it("marks additional token matches as duplicates", () => {
        const doc1 = createMockDoc({ 
          _id: "id_1", 
          token: "same_token",
          bundleId: "com.example.app",
          environment: "production",
        });
        const doc2 = createMockDoc({ 
          _id: "id_2", 
          token: "same_token",
          bundleId: "com.example.app",
          environment: "production",
        });
        const doc3 = createMockDoc({ 
          _id: "id_3", 
          token: "same_token",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([doc1, doc2, doc3], {
          token: "same_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toEqual(doc1);
        expect(result.duplicateIds).toContain("id_2");
        expect(result.duplicateIds).toContain("id_3");
        expect(result.duplicateIds).not.toContain("id_1");
      });

      it("marks deviceId matches as duplicates when they differ from canonical", () => {
        const tokenMatch = createMockDoc({ 
          _id: "id_token", 
          token: "matching_token",
          deviceId: "device_1",
          bundleId: "com.example.app",
          environment: "production",
        });
        const deviceMatch = createMockDoc({ 
          _id: "id_device", 
          token: "different_token",
          deviceId: "device_2",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([tokenMatch, deviceMatch], {
          token: "matching_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          deviceId: "device_2",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toEqual(tokenMatch);
        expect(result.duplicateIds).toContain("id_device");
      });

      it("does not duplicate canonical in duplicateIds", () => {
        const doc = createMockDoc({ 
          _id: "id_both", 
          token: "same_token",
          deviceId: "same_device",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        const result = reconcilePushTokenRows([doc], {
          token: "same_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          deviceId: "same_device",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toEqual(doc);
        expect(result.duplicateIds).toEqual([]);
      });
    });

    describe("priority", () => {
      it("prefers token match over deviceId match for canonical", () => {
        const tokenMatch = createMockDoc({ 
          _id: "id_token", 
          token: "matching_token",
          deviceId: "device_1",
          bundleId: "com.example.app",
          environment: "production",
        });
        const deviceMatch = createMockDoc({ 
          _id: "id_device", 
          token: "different_token",
          deviceId: "device_2",
          bundleId: "com.example.app",
          environment: "production",
        });
        
        // Token match comes second but should still be canonical
        const result = reconcilePushTokenRows([deviceMatch, tokenMatch], {
          token: "matching_token",
          environment: "production",
          bundleId: "com.example.app",
          platform: "ios",
          deviceId: "device_2",
          updatedAt: Date.now(),
        });
        
        expect(result.canonical).toEqual(tokenMatch);
      });
    });
  });
});
