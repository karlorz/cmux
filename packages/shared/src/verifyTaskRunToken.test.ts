import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { verifyTaskRunToken } from "./verifyTaskRunToken";
import type { TaskRunTokenPayload } from "./verifyTaskRunToken";

const TEST_SECRET = "test-secret-key-for-jwt-signing-32chars";

async function createTestToken(
  payload: Record<string, unknown>,
  secret: string = TEST_SECRET
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(new TextEncoder().encode(secret));
}

describe("verifyTaskRunToken", () => {
  describe("valid tokens", () => {
    it("verifies a valid token with all required fields", async () => {
      const payload: TaskRunTokenPayload = {
        taskRunId: "task_123",
        teamId: "team_456",
        userId: "user_789",
      };
      const token = await createTestToken(payload);

      const result = await verifyTaskRunToken(token, TEST_SECRET);

      expect(result.taskRunId).toBe("task_123");
      expect(result.teamId).toBe("team_456");
      expect(result.userId).toBe("user_789");
    });

    it("accepts secret as Uint8Array", async () => {
      const payload: TaskRunTokenPayload = {
        taskRunId: "task_abc",
        teamId: "team_def",
        userId: "user_ghi",
      };
      const secretBytes = new TextEncoder().encode(TEST_SECRET);
      const token = await createTestToken(payload);

      const result = await verifyTaskRunToken(token, secretBytes);

      expect(result.taskRunId).toBe("task_abc");
    });

    it("ignores extra fields in payload", async () => {
      const payload = {
        taskRunId: "task_123",
        teamId: "team_456",
        userId: "user_789",
        extraField: "ignored",
      };
      const token = await createTestToken(payload);

      const result = await verifyTaskRunToken(token, TEST_SECRET);

      expect(result.taskRunId).toBe("task_123");
      expect((result as Record<string, unknown>).extraField).toBeUndefined();
    });
  });

  describe("invalid tokens", () => {
    it("rejects token with wrong secret", async () => {
      const payload: TaskRunTokenPayload = {
        taskRunId: "task_123",
        teamId: "team_456",
        userId: "user_789",
      };
      const token = await createTestToken(payload, "correct-secret-32chars!!");

      await expect(
        verifyTaskRunToken(token, "wrong-secret-32characters!!")
      ).rejects.toThrow();
    });

    it("rejects malformed token", async () => {
      await expect(
        verifyTaskRunToken("not-a-valid-jwt", TEST_SECRET)
      ).rejects.toThrow();
    });

    it("rejects token missing taskRunId", async () => {
      const payload = {
        teamId: "team_456",
        userId: "user_789",
      };
      const token = await createTestToken(payload);

      await expect(verifyTaskRunToken(token, TEST_SECRET)).rejects.toThrow(
        "Invalid CMUX task run token payload"
      );
    });

    it("rejects token missing teamId", async () => {
      const payload = {
        taskRunId: "task_123",
        userId: "user_789",
      };
      const token = await createTestToken(payload);

      await expect(verifyTaskRunToken(token, TEST_SECRET)).rejects.toThrow(
        "Invalid CMUX task run token payload"
      );
    });

    it("rejects token missing userId", async () => {
      const payload = {
        taskRunId: "task_123",
        teamId: "team_456",
      };
      const token = await createTestToken(payload);

      await expect(verifyTaskRunToken(token, TEST_SECRET)).rejects.toThrow(
        "Invalid CMUX task run token payload"
      );
    });

    it("rejects token with empty taskRunId", async () => {
      const payload = {
        taskRunId: "",
        teamId: "team_456",
        userId: "user_789",
      };
      const token = await createTestToken(payload);

      await expect(verifyTaskRunToken(token, TEST_SECRET)).rejects.toThrow(
        "Invalid CMUX task run token payload"
      );
    });
  });
});
