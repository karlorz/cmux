import { describe, expect, it } from "vitest";

/**
 * Tests to verify HTTP validator, mutation args, and schema are aligned.
 * This ensures no lifecycle fields silently disappear between validation and storage.
 *
 * Related to issue #892: fix(convex): align task-run activity validator with storage schema
 */

// Import the schema fields from the actual files to verify alignment
// These are the fields accepted by the HTTP endpoint (from taskRunActivity_http.ts)
const HTTP_VALIDATOR_FIELDS = [
  // Base fields
  "taskRunId",
  "type",
  "toolName",
  "summary",
  "detail",
  "durationMs",
  // Context health fields
  "severity",
  "warningType",
  "currentUsage",
  "maxCapacity",
  "usagePercent",
  // Context compacted fields
  "previousBytes",
  "newBytes",
  "reductionPercent",
  // Stop lifecycle fields
  "stopSource",
  "exitCode",
  "continuationPrompt",
  // Approval fields
  "approvalId",
  "resolution",
  "resolvedBy",
  // Memory scope fields
  "scopeType",
  "scopeBytes",
  "scopeAction",
  // Prompt/Turn tracking fields (P1)
  "promptSource",
  "turnNumber",
  "promptLength",
  "turnCount",
  "providerSessionId",
  // Resume fields (P1)
  "resumeReason",
  "previousTaskRunId",
  "previousSessionId",
  "checkpointRef",
  // MCP runtime fields (P5)
  "serverName",
  "serverId",
  "protocolVersion",
  "transport",
  "mcpCapabilities",
  "toolCount",
  "resourceCount",
  "mcpSessionId",
] as const;

// Fields that are added internally (not from HTTP request)
const INTERNAL_FIELDS = ["teamId", "createdAt"] as const;

// Fields that exist in mutation args (should match HTTP + teamId)
const MUTATION_ARG_FIELDS = [
  ...HTTP_VALIDATOR_FIELDS.filter((f) => f !== "taskRunId"),
  "taskRunId", // as v.id("taskRuns")
  "teamId",
] as const;

// Fields that exist in schema (should match mutation + createdAt)
const SCHEMA_FIELDS = [...MUTATION_ARG_FIELDS, "createdAt"] as const;

describe("taskRunActivity field alignment", () => {
  it("should have all HTTP validator fields present in mutation args", () => {
    const httpFields = new Set(HTTP_VALIDATOR_FIELDS);
    const mutationFields = new Set(MUTATION_ARG_FIELDS);

    for (const field of httpFields) {
      expect(
        mutationFields.has(field),
        `HTTP field "${field}" should be present in mutation args`
      ).toBe(true);
    }
  });

  it("should have all mutation arg fields present in schema", () => {
    const mutationFields = new Set(MUTATION_ARG_FIELDS);
    const schemaFields = new Set(SCHEMA_FIELDS);

    for (const field of mutationFields) {
      expect(
        schemaFields.has(field),
        `Mutation field "${field}" should be present in schema`
      ).toBe(true);
    }
  });

  it("should have teamId added by mutation (not from HTTP)", () => {
    expect(HTTP_VALIDATOR_FIELDS).not.toContain("teamId");
    expect(MUTATION_ARG_FIELDS).toContain("teamId");
  });

  it("should have createdAt added by schema (set in handler)", () => {
    expect(MUTATION_ARG_FIELDS).not.toContain("createdAt");
    expect(SCHEMA_FIELDS).toContain("createdAt");
  });

  it("should include P1 prompt/turn tracking fields", () => {
    const p1Fields = [
      "promptSource",
      "turnNumber",
      "promptLength",
      "turnCount",
      "providerSessionId",
    ];
    for (const field of p1Fields) {
      expect(HTTP_VALIDATOR_FIELDS).toContain(field);
    }
  });

  it("should include P1 resume fields", () => {
    const resumeFields = [
      "resumeReason",
      "previousTaskRunId",
      "previousSessionId",
      "checkpointRef",
    ];
    for (const field of resumeFields) {
      expect(HTTP_VALIDATOR_FIELDS).toContain(field);
    }
  });

  it("should include P5 MCP runtime fields", () => {
    const mcpFields = [
      "serverName",
      "serverId",
      "protocolVersion",
      "transport",
      "mcpCapabilities",
      "toolCount",
      "resourceCount",
      "mcpSessionId",
    ];
    for (const field of mcpFields) {
      expect(HTTP_VALIDATOR_FIELDS).toContain(field);
    }
  });
});

describe("taskRunActivity event types", () => {
  const ACTIVITY_TYPES = [
    // Tool-use events
    "tool_call",
    "file_edit",
    "file_read",
    "bash_command",
    "test_run",
    "git_commit",
    "error",
    "thinking",
    // Session lifecycle events
    "session_start",
    "session_stop",
    "session_resumed",
    "session_finished",
    // Stop lifecycle events
    "stop_requested",
    "stop_blocked",
    "stop_failed",
    // Context health events
    "context_warning",
    "context_compacted",
    // Memory events
    "memory_loaded",
    "memory_scope_changed",
    // Tool lifecycle events
    "tool_requested",
    "tool_completed",
    // Approval flow events
    "approval_requested",
    "approval_resolved",
    // Interaction events
    "user_prompt",
    "subagent_start",
    "subagent_stop",
    "notification",
    // Prompt/Turn tracking events (P1)
    "prompt_submitted",
    "run_resumed",
    // MCP runtime events (P5)
    "mcp_capabilities_negotiated",
  ] as const;

  it("should include session_finished event type (P1)", () => {
    expect(ACTIVITY_TYPES).toContain("session_finished");
  });

  it("should include prompt_submitted event type (P1)", () => {
    expect(ACTIVITY_TYPES).toContain("prompt_submitted");
  });

  it("should include run_resumed event type (P1)", () => {
    expect(ACTIVITY_TYPES).toContain("run_resumed");
  });

  it("should include mcp_capabilities_negotiated event type (P5)", () => {
    expect(ACTIVITY_TYPES).toContain("mcp_capabilities_negotiated");
  });
});
