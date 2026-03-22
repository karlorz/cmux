import { describe, expect, it } from "vitest";
import { formatClaudeMessage } from "./claudeMessageFormatter";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

/**
 * These tests use partial message objects cast to SDKMessage.
 * The formatter handles runtime data gracefully, so we test the
 * formatting logic without needing complete SDK type conformance.
 */

// Helper to create test messages without full SDK type compliance
const msg = <T>(data: T): SDKMessage => data as unknown as SDKMessage;

describe("claudeMessageFormatter", () => {
  describe("formatClaudeMessage", () => {
    describe("assistant messages", () => {
      it("formats text content", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Hello world" }],
              usage: { input_tokens: 10, output_tokens: 5 },
            },
          })
        );

        expect(result).toContain("💬 Hello world");
        expect(result).toContain("tokens: in=10 out=5");
      });

      it("formats tool use - Read", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Read",
                  input: { file_path: "/path/to/file.ts" },
                },
              ],
            },
          })
        );

        expect(result).toContain("📖 Read /path/to/file.ts");
      });

      it("formats tool use - Write with line count", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Write",
                  input: { file_path: "/path/to/file.ts", content: "line1\nline2\nline3" },
                },
              ],
            },
          })
        );

        expect(result).toContain("✍️ Write /path/to/file.ts (3 lines)");
      });

      it("formats tool use - Edit", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Edit",
                  input: { file_path: "/path/to/file.ts" },
                },
              ],
            },
          })
        );

        expect(result).toContain("✏️ Edit /path/to/file.ts");
      });

      it("formats tool use - Bash with truncation", () => {
        const longCommand =
          "npm run build && npm run test && npm run lint && npm run typecheck && npm run deploy";
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Bash",
                  input: { command: longCommand },
                },
              ],
            },
          })
        );

        expect(result).toContain("🔨 Bash");
        expect(result).toContain("...");
        // Truncated to 50 chars
        expect(result.length).toBeLessThan(longCommand.length + 50);
      });

      it("formats tool use - Glob pattern", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Glob",
                  input: { pattern: "**/*.ts" },
                },
              ],
            },
          })
        );

        expect(result).toContain('🔍 Glob "**/*.ts"');
      });

      it("formats tool use - Grep pattern", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "Grep",
                  input: { pattern: "TODO" },
                },
              ],
            },
          })
        );

        expect(result).toContain('🔎 Grep "TODO"');
      });

      it("formats tool use - TodoWrite with items", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "TodoWrite",
                  input: {
                    todos: [
                      { content: "Task 1", status: "completed" },
                      { content: "Task 2", status: "in_progress" },
                      { content: "Task 3", status: "pending" },
                    ],
                  },
                },
              ],
            },
          })
        );

        expect(result).toContain("📝 TodoWrite");
        expect(result).toContain("✅ Task 1");
        expect(result).toContain("⏳ Task 2");
        expect(result).toContain("⭕ Task 3");
      });

      it("formats tool use - TodoWrite with empty todos", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "TodoWrite",
                  input: { todos: [] },
                },
              ],
            },
          })
        );

        expect(result).toContain("(0 items)");
      });

      it("formats playwright browser navigate", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "mcp___playwright_mcp__browser_navigate",
                  input: { url: "https://example.com" },
                },
              ],
            },
          })
        );

        expect(result).toContain("🌐");
        expect(result).toContain("→ https://example.com");
      });

      it("formats playwright browser screenshot", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "mcp___playwright_mcp__browser_take_screenshot",
                  input: { name: "homepage" },
                },
              ],
            },
          })
        );

        expect(result).toContain("📸");
        expect(result).toContain("📸 homepage");
      });

      it("formats video start", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "mcp___video__start_video",
                  input: { name: "test-recording" },
                },
              ],
            },
          })
        );

        expect(result).toContain("🎬");
        expect(result).toContain('Starting "test-recording"');
      });

      it("formats video end", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "mcp___video__end_video",
                  input: { name: "test-recording" },
                },
              ],
            },
          })
        );

        expect(result).toContain("🛑");
        expect(result).toContain('Ending "test-recording"');
      });

      it("formats unknown tool with input keys", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "CustomTool",
                  input: { foo: "bar", baz: 123 },
                },
              ],
            },
          })
        );

        expect(result).toContain("🔧 CustomTool {foo, baz}");
      });

      it("formats tool with no input", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [
                {
                  type: "tool_use",
                  name: "EmptyTool",
                  input: {},
                },
              ],
            },
          })
        );

        expect(result).toContain("🔧 EmptyTool");
        // Should not have trailing curly braces
        expect(result).not.toContain("{}");
      });

      it("handles missing usage info", () => {
        const result = formatClaudeMessage(
          msg({
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Hello" }],
              usage: undefined,
            },
          })
        );

        expect(result).toContain("💬 Hello");
        expect(result).not.toContain("tokens:");
      });
    });

    describe("user messages", () => {
      it("formats simple string content", () => {
        const result = formatClaudeMessage(
          msg({
            type: "user",
            message: {
              role: "user",
              content: "Hello Claude",
            },
          })
        );

        expect(result).toBe("👤 User: Hello Claude");
      });

      it("formats tool result content", () => {
        const result = formatClaudeMessage(
          msg({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tool_123",
                  content: "File contents here",
                },
              ],
            },
          })
        );

        expect(result).toContain("✓ Result: File contents here");
      });

      it("formats text block in array", () => {
        const result = formatClaudeMessage(
          msg({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "User text message",
                },
              ],
            },
          })
        );

        expect(result).toBe("👤 User: User text message");
      });

      it("truncates long tool results", () => {
        const longContent = "A".repeat(300);
        const result = formatClaudeMessage(
          msg({
            type: "user",
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tool_123",
                  content: longContent,
                },
              ],
            },
          })
        );

        expect(result).toContain("...");
        expect(result.length).toBeLessThan(longContent.length);
      });

      it("handles complex content fallback", () => {
        const result = formatClaudeMessage(
          msg({
            type: "user",
            message: {
              role: "user",
              content: { complex: true },
            },
          })
        );

        expect(result).toBe("👤 User message (complex content)");
      });
    });

    describe("result messages", () => {
      it("formats success result", () => {
        const result = formatClaudeMessage(
          msg({
            type: "result",
            subtype: "success",
            num_turns: 5,
            duration_ms: 12345,
            total_cost_usd: 0.0123,
            result: "Task completed successfully",
            is_error: false,
          })
        );

        expect(result).toContain("✅ Success");
        expect(result).toContain("5 turns");
        expect(result).toContain("12345ms");
        expect(result).toContain("$0.0123");
        expect(result).toContain("Task completed successfully");
      });

      it("formats error result", () => {
        const result = formatClaudeMessage(
          msg({
            type: "result",
            subtype: "error_max_turns",
            num_turns: 10,
            duration_ms: 5000,
            total_cost_usd: 0.05,
            is_error: true,
          })
        );

        expect(result).toContain("❌ Error: error_max_turns");
        expect(result).toContain("10 turns");
        expect(result).toContain("5000ms");
        expect(result).toContain("$0.0500");
      });
    });

    describe("system messages", () => {
      it("formats init message", () => {
        const result = formatClaudeMessage(
          msg({
            type: "system",
            subtype: "init",
            model: "claude-3-opus",
            tools: ["Read", "Write"],
            mcp_servers: [
              { name: "playwright", status: "connected" },
              { name: "memory", status: "connected" },
            ],
            permissionMode: "auto_approve",
          })
        );

        expect(result).toContain("🔧 System initialized");
        expect(result).toContain("claude-3-opus");
        expect(result).toContain("2 available");
        expect(result).toContain("playwright(connected)");
        expect(result).toContain("auto_approve");
      });

      it("formats compact boundary message", () => {
        const result = formatClaudeMessage(
          msg({
            type: "system",
            subtype: "compact_boundary",
            compact_metadata: {
              trigger: "context_limit",
              pre_tokens: 150000,
            },
          })
        );

        expect(result).toContain("📦 Compacted");
        expect(result).toContain("context_limit");
        expect(result).toContain("150000 tokens");
      });

      it("formats hook response message", () => {
        const result = formatClaudeMessage(
          msg({
            type: "system",
            subtype: "hook_response",
            hook_name: "pre-commit",
            hook_event: "pre_commit",
            exit_code: 0,
          })
        );

        expect(result).toContain("🪝 Hook: pre-commit (pre_commit) - exit 0");
      });

      it("formats status message", () => {
        const result = formatClaudeMessage(
          msg({
            type: "system",
            subtype: "status",
            status: "thinking",
          })
        );

        expect(result).toContain("🔄 Status: thinking");
      });

      it("formats unknown system subtype", () => {
        const result = formatClaudeMessage(
          msg({
            type: "system",
            subtype: "unknown_subtype",
          })
        );

        expect(result).toContain("🔧 System: unknown_subtype");
      });
    });

    describe("tool_progress messages", () => {
      it("formats tool progress without parent", () => {
        const result = formatClaudeMessage(
          msg({
            type: "tool_progress",
            tool_name: "Read",
            parent_tool_use_id: null,
            elapsed_time_seconds: 2.5,
          })
        );

        expect(result).toContain("⏳ Tool progress: Read");
        expect(result).toContain("2.5s");
        expect(result).not.toContain("child of");
      });

      it("formats tool progress with parent", () => {
        const result = formatClaudeMessage(
          msg({
            type: "tool_progress",
            tool_name: "Bash",
            parent_tool_use_id: "parent_123",
            elapsed_time_seconds: 5.0,
          })
        );

        expect(result).toContain("⏳ Tool progress: Bash");
        expect(result).toContain("(child of parent_123)");
        expect(result).toContain("5.0s");
      });
    });

    describe("auth_status messages", () => {
      it("formats authenticating status", () => {
        const result = formatClaudeMessage(
          msg({
            type: "auth_status",
            isAuthenticating: true,
            output: ["Please visit the URL"],
            error: undefined,
          })
        );

        expect(result).toContain("🔐 Auth status: authenticating");
        expect(result).toContain('output="Please visit the URL"');
      });

      it("formats idle auth status with error", () => {
        const result = formatClaudeMessage(
          msg({
            type: "auth_status",
            isAuthenticating: false,
            output: [],
            error: "Auth failed",
          })
        );

        expect(result).toContain("🔐 Auth status: idle");
        expect(result).toContain('error="Auth failed"');
      });

      it("formats auth status without output or error", () => {
        const result = formatClaudeMessage(
          msg({
            type: "auth_status",
            isAuthenticating: false,
            output: [],
            error: undefined,
          })
        );

        expect(result).toBe("🔐 Auth status: idle");
      });
    });

    describe("stream_event messages", () => {
      it("returns empty string for stream events", () => {
        const result = formatClaudeMessage(
          msg({
            type: "stream_event",
            event: { type: "content_block_delta" },
          })
        );

        expect(result).toBe("");
      });
    });

    describe("unknown message types", () => {
      it("formats unknown message type", () => {
        const result = formatClaudeMessage(
          msg({
            type: "future_type",
          })
        );

        expect(result).toBe("❓ Unknown message type");
      });
    });
  });
});
