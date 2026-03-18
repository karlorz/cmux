import { describe, it, expect } from "vitest";
import {
  getMemoryMcpServerScript,
  getCrossToolSymlinkCommands,
  getMemoryStartupCommand,
  getMemorySeedFiles,
  getMemoryProtocolInstructions,
  MEMORY_PROTOCOL_DIR,
  MEMORY_DAILY_DIR,
  MEMORY_KNOWLEDGE_DIR,
  MEMORY_ORCHESTRATION_DIR,
  MEMORY_BEHAVIOR_DIR,
  MEMORY_BEHAVIOR_DOMAINS_DIR,
  MEMORY_BEHAVIOR_PROJECTS_DIR,
  MEMORY_BEHAVIOR_ARCHIVE_DIR,
  getBehaviorHotSeedContent,
  getBehaviorIndexSeedContent,
  generateBehaviorRuleId,
  generateCorrectionId,
  formatBehaviorCorrection,
  extractBehaviorRulesSection,
  getOrchestrationRulesInstructions,
  type OrchestrationRuleForInstructions,
} from "./agent-memory-protocol";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("agent-memory-protocol", () => {
  it("generates valid JavaScript for MCP server script", () => {
    const script = getMemoryMcpServerScript();
    
    // Write to temp file and validate with node --check
    const tempFile = join(tmpdir(), `mcp-server-test-${Date.now()}.js`);
    try {
      writeFileSync(tempFile, script);
      // node --check validates syntax without executing
      execSync(`node --check "${tempFile}"`, { encoding: "utf-8" });
    } finally {
      try {
        unlinkSync(tempFile);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("MCP server script contains expected tools", () => {
    const script = getMemoryMcpServerScript();

    const expectedTools = [
      "read_memory",
      "list_daily_logs",
      "read_daily_log",
      "search_memory",
      "send_message",
      "get_my_messages",
      "mark_read",
      "append_daily_log",
      "update_knowledge",
      "add_task",
      "update_task",
      // Behavior memory tools
      "read_behavior",
      "add_behavior_rule",
      "log_correction",
      "confirm_behavior_rule",
      // Behavior admin/decay tools
      "check_stale_behavior",
      "compact_corrections",
      "update_behavior_index",
    ];

    for (const tool of expectedTools) {
      expect(script).toContain(`name: '${tool}'`);
    }
  });

  describe("getCrossToolSymlinkCommands", () => {
    it("returns exactly 3 commands", () => {
      const commands = getCrossToolSymlinkCommands();
      expect(commands).toHaveLength(3);
    });

    it("first command creates directories for codex and gemini", () => {
      const commands = getCrossToolSymlinkCommands();
      expect(commands[0]).toBe("mkdir -p ~/.codex ~/.gemini");
    });

    it("second command creates symlink for AGENTS.md with guards", () => {
      const commands = getCrossToolSymlinkCommands();
      // Should check if CLAUDE.md exists before creating symlink
      expect(commands[1]).toContain("[ -f ~/.claude/CLAUDE.md ]");
      // Should use ln -sf for force symlink
      expect(commands[1]).toContain("ln -sf");
      // Should target the correct paths
      expect(commands[1]).toContain("~/.claude/CLAUDE.md");
      expect(commands[1]).toContain("~/.codex/AGENTS.md");
      // Should include || true for idempotency
      expect(commands[1]).toContain("|| true");
    });

    it("third command creates symlink for GEMINI.md with guards", () => {
      const commands = getCrossToolSymlinkCommands();
      // Should check if CLAUDE.md exists before creating symlink
      expect(commands[2]).toContain("[ -f ~/.claude/CLAUDE.md ]");
      // Should use ln -sf for force symlink
      expect(commands[2]).toContain("ln -sf");
      // Should target the correct paths
      expect(commands[2]).toContain("~/.claude/CLAUDE.md");
      expect(commands[2]).toContain("~/.gemini/GEMINI.md");
      // Should include || true for idempotency
      expect(commands[2]).toContain("|| true");
    });

    it("symlinks use consistent source path", () => {
      const commands = getCrossToolSymlinkCommands();
      // Both symlinks should point to the same source file
      const codexCmd = commands[1];
      const geminiCmd = commands[2];

      // Extract source path from "ln -sf <source> <dest>"
      const sourceRegex = /ln -sf\s+(\S+)/;
      const codexSource = codexCmd.match(sourceRegex)?.[1];
      const geminiSource = geminiCmd.match(sourceRegex)?.[1];

      expect(codexSource).toBe("~/.claude/CLAUDE.md");
      expect(geminiSource).toBe("~/.claude/CLAUDE.md");
    });
  });

  describe("getMemoryStartupCommand", () => {
    it("creates required memory directories", () => {
      const command = getMemoryStartupCommand();
      expect(command).toContain("mkdir -p");
      expect(command).toContain(MEMORY_DAILY_DIR);
      expect(command).toContain(MEMORY_KNOWLEDGE_DIR);
      expect(command).toContain(MEMORY_ORCHESTRATION_DIR);
    });

    it("creates behavior memory directories", () => {
      const command = getMemoryStartupCommand();
      expect(command).toContain(MEMORY_BEHAVIOR_DIR);
      expect(command).toContain(MEMORY_BEHAVIOR_DOMAINS_DIR);
      expect(command).toContain(MEMORY_BEHAVIOR_PROJECTS_DIR);
      expect(command).toContain(MEMORY_BEHAVIOR_ARCHIVE_DIR);
    });
  });

  describe("getMemorySeedFiles", () => {
    it("returns required memory files", () => {
      const files = getMemorySeedFiles("test-sandbox-id");

      // Check that required files are present
      const paths = files.map((f) => f.destinationPath);
      expect(paths).toContain(`${MEMORY_PROTOCOL_DIR}/TASKS.json`);
      expect(paths).toContain(`${MEMORY_KNOWLEDGE_DIR}/MEMORY.md`);
      expect(paths).toContain(`${MEMORY_PROTOCOL_DIR}/MAILBOX.json`);
      expect(paths).toContain(`${MEMORY_PROTOCOL_DIR}/sync.sh`);
      expect(paths).toContain(`${MEMORY_PROTOCOL_DIR}/mcp-server.js`);
    });

    it("sync.sh has execute permissions", () => {
      const files = getMemorySeedFiles("test-sandbox-id");
      const syncFile = files.find(
        (f) => f.destinationPath === `${MEMORY_PROTOCOL_DIR}/sync.sh`
      );
      expect(syncFile).toBeDefined();
      expect(syncFile?.mode).toBe("755");
    });

    it("mcp-server.js has execute permissions", () => {
      const files = getMemorySeedFiles("test-sandbox-id");
      const mcpFile = files.find(
        (f) => f.destinationPath === `${MEMORY_PROTOCOL_DIR}/mcp-server.js`
      );
      expect(mcpFile).toBeDefined();
      expect(mcpFile?.mode).toBe("755");
    });

    it("includes previous knowledge when provided", () => {
      const previousKnowledge = "# Previous Knowledge\n- Important fact";
      const files = getMemorySeedFiles(
        "test-sandbox-id",
        previousKnowledge,
        undefined
      );

      const knowledgeFile = files.find((f) =>
        f.destinationPath.includes("MEMORY.md")
      );
      expect(knowledgeFile).toBeDefined();

      // Decode content and verify
      const content = Buffer.from(
        knowledgeFile?.contentBase64 ?? "",
        "base64"
      ).toString();
      expect(content).toContain("Previous Knowledge");
    });

    it("includes orchestration files when options provided", () => {
      const files = getMemorySeedFiles("test-sandbox-id", undefined, undefined, {
        headAgent: "claude/opus-4.5",
        orchestrationId: "orch_test123",
        isOrchestrationHead: true,
      });

      const paths = files.map((f) => f.destinationPath);
      expect(paths).toContain(`${MEMORY_ORCHESTRATION_DIR}/PLAN.json`);
      expect(paths).toContain(`${MEMORY_ORCHESTRATION_DIR}/AGENTS.json`);
      expect(paths).toContain(`${MEMORY_ORCHESTRATION_DIR}/EVENTS.jsonl`);
      expect(paths).toContain(
        `${MEMORY_ORCHESTRATION_DIR}/HEAD_AGENT_INSTRUCTIONS.md`
      );
    });

    it("includes behavior memory files", () => {
      const files = getMemorySeedFiles("test-sandbox-id");

      const paths = files.map((f) => f.destinationPath);
      expect(paths).toContain(`${MEMORY_BEHAVIOR_DIR}/HOT.md`);
      expect(paths).toContain(`${MEMORY_BEHAVIOR_DIR}/corrections.jsonl`);
      expect(paths).toContain(`${MEMORY_BEHAVIOR_DIR}/index.json`);
      expect(paths).toContain(`${MEMORY_BEHAVIOR_DOMAINS_DIR}/.keep`);
      expect(paths).toContain(`${MEMORY_BEHAVIOR_PROJECTS_DIR}/.keep`);
      expect(paths).toContain(`${MEMORY_BEHAVIOR_ARCHIVE_DIR}/.keep`);
    });

    it("includes previous behavior HOT when provided", () => {
      const previousBehavior = "# My Custom HOT Rules\n- Always use TypeScript";
      const files = getMemorySeedFiles(
        "test-sandbox-id",
        undefined,
        undefined,
        undefined,
        previousBehavior
      );

      const hotFile = files.find((f) =>
        f.destinationPath.includes("HOT.md")
      );
      expect(hotFile).toBeDefined();

      // Decode content and verify
      const content = Buffer.from(
        hotFile?.contentBase64 ?? "",
        "base64"
      ).toString();
      expect(content).toContain("My Custom HOT Rules");
      expect(content).toContain("Always use TypeScript");
    });

    it("uses default behavior HOT when no previous provided", () => {
      const files = getMemorySeedFiles("test-sandbox-id");

      const hotFile = files.find((f) =>
        f.destinationPath.includes("HOT.md")
      );
      expect(hotFile).toBeDefined();

      // Decode content and verify it's the default template
      const content = Buffer.from(
        hotFile?.contentBase64 ?? "",
        "base64"
      ).toString();
      expect(content).toContain("# HOT Behavior Rules");
      expect(content).toContain("Active preferences and workflow rules");
    });
  });

  describe("behavior memory helpers", () => {
    it("getBehaviorHotSeedContent returns valid template", () => {
      const content = getBehaviorHotSeedContent();
      expect(content).toContain("# HOT Behavior Rules");
      expect(content).toContain("## Format");
      expect(content).toContain("## Rules");
    });

    it("getBehaviorIndexSeedContent returns valid JSON", () => {
      const content = getBehaviorIndexSeedContent();
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe(1);
      expect(parsed.stats).toBeDefined();
      expect(parsed.stats.hotRules).toBe(0);
      expect(parsed.stats.corrections).toBe(0);
      expect(parsed.stats.domains).toEqual([]);
      expect(parsed.stats.projects).toEqual([]);
    });

    it("generateBehaviorRuleId returns unique IDs", () => {
      const id1 = generateBehaviorRuleId();
      const id2 = generateBehaviorRuleId();
      expect(id1).toMatch(/^rule_[a-z0-9]+$/);
      expect(id2).toMatch(/^rule_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("generateCorrectionId returns unique IDs", () => {
      const id1 = generateCorrectionId();
      const id2 = generateCorrectionId();
      expect(id1).toMatch(/^corr_[a-z0-9]+$/);
      expect(id2).toMatch(/^corr_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("extractBehaviorRulesSection extracts rules from HOT.md content", () => {
      const hotMdContent = `# HOT Behavior Rules

## Format
Each rule should be on its own line.

## Rules

- [confirmed] Always use bun instead of npm
- Use vitest, not jest
- [domain:testing] Mock external APIs in unit tests

---
*Add rules here*
`;
      const section = extractBehaviorRulesSection(hotMdContent);
      expect(section).toContain("## Active Behavior Rules");
      expect(section).toContain("- [confirmed] Always use bun instead of npm");
      expect(section).toContain("- Use vitest, not jest");
      expect(section).toContain("- [domain:testing] Mock external APIs in unit tests");
    });

    it("extractBehaviorRulesSection returns empty for content without rules", () => {
      const hotMdContent = `# HOT Behavior Rules

## Rules

<!-- Add rules below this line -->

---
`;
      const section = extractBehaviorRulesSection(hotMdContent);
      expect(section).toBe("");
    });

    it("extractBehaviorRulesSection returns empty for empty content", () => {
      expect(extractBehaviorRulesSection("")).toBe("");
      expect(extractBehaviorRulesSection("   ")).toBe("");
    });

    it("formatBehaviorCorrection returns valid JSONL", () => {
      const correction = {
        id: "corr_test123",
        timestamp: "2026-03-12T10:00:00Z",
        wrongAction: "Used npm install",
        correctAction: "Should use bun install",
        context: "Package management",
        learnedRule: "Always use bun instead of npm",
      };
      const formatted = formatBehaviorCorrection(correction);
      const parsed = JSON.parse(formatted);
      expect(parsed.id).toBe("corr_test123");
      expect(parsed.wrongAction).toBe("Used npm install");
      expect(parsed.correctAction).toBe("Should use bun install");
    });
  });

  describe("getMemoryProtocolInstructions", () => {
    it("includes behavior memory in structure section", () => {
      const instructions = getMemoryProtocolInstructions();
      expect(instructions).toContain("behavior/HOT.md");
      expect(instructions).toContain("behavior/corrections.jsonl");
    });

    it("includes behavior memory in on-start section", () => {
      const instructions = getMemoryProtocolInstructions();
      expect(instructions).toContain("Read `behavior/HOT.md`");
    });

    it("includes behavior memory in on-completion section", () => {
      const instructions = getMemoryProtocolInstructions();
      expect(instructions).toContain("corrections.jsonl");
      expect(instructions).toContain("If the user corrected you");
    });

    it("distinguishes knowledge from behavior", () => {
      const instructions = getMemoryProtocolInstructions();
      expect(instructions).toContain("Knowledge vs Behavior");
      expect(instructions).toContain("facts");
      expect(instructions).toContain("preferences");
    });

    it("includes behavior memory section with format examples", () => {
      const instructions = getMemoryProtocolInstructions();
      expect(instructions).toContain("Behavior Memory (Self-Improving)");
      expect(instructions).toContain("HOT.md Format");
      expect(instructions).toContain("corrections.jsonl Format");
      expect(instructions).toContain("[confirmed]");
    });
  });

  describe("getOrchestrationRulesInstructions", () => {
    const makeRule = (
      overrides: Partial<OrchestrationRuleForInstructions> & { ruleId: string; text: string }
    ): OrchestrationRuleForInstructions => ({
      lane: "hot",
      confidence: 0.5,
      ...overrides,
    });

    it("returns empty string for empty or null-ish input", () => {
      expect(getOrchestrationRulesInstructions([])).toBe("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(getOrchestrationRulesInstructions(null as any)).toBe("");
    });

    it("renders header and lane sections", () => {
      const rules = [
        makeRule({ ruleId: "r1", text: "Always test", lane: "hot", confidence: 0.9 }),
        makeRule({ ruleId: "r2", text: "Use bun", lane: "project", confidence: 0.8 }),
      ];
      const result = getOrchestrationRulesInstructions(rules);
      expect(result).toContain("# Orchestration Rules (Team-Learned)");
      expect(result).toContain("## Hot Rules (Always Apply)");
      expect(result).toContain("## Project Rules");
      expect(result).toContain("- Always test");
      expect(result).toContain("- Use bun");
    });

    it("sorts rules by confidence descending within each lane", () => {
      const rules = [
        makeRule({ ruleId: "r1", text: "Low confidence", lane: "hot", confidence: 0.3 }),
        makeRule({ ruleId: "r2", text: "High confidence", lane: "hot", confidence: 0.9 }),
        makeRule({ ruleId: "r3", text: "Medium confidence", lane: "hot", confidence: 0.6 }),
      ];
      const result = getOrchestrationRulesInstructions(rules);
      const highIdx = result.indexOf("High confidence");
      const medIdx = result.indexOf("Medium confidence");
      const lowIdx = result.indexOf("Low confidence");
      expect(highIdx).toBeLessThan(medIdx);
      expect(medIdx).toBeLessThan(lowIdx);
    });

    it("orders lanes: hot before orchestration before project", () => {
      const rules = [
        makeRule({ ruleId: "r1", text: "Project rule", lane: "project", confidence: 1.0 }),
        makeRule({ ruleId: "r2", text: "Hot rule", lane: "hot", confidence: 0.5 }),
        makeRule({ ruleId: "r3", text: "Orch rule", lane: "orchestration", confidence: 0.5 }),
      ];
      const result = getOrchestrationRulesInstructions(rules);
      const hotIdx = result.indexOf("## Hot Rules");
      const orchIdx = result.indexOf("## Orchestration Rules");
      const projIdx = result.indexOf("## Project Rules");
      expect(hotIdx).toBeLessThan(orchIdx);
      expect(orchIdx).toBeLessThan(projIdx);
    });

    it("handles multi-line rule text with proper indentation", () => {
      const rules = [
        makeRule({
          ruleId: "r1",
          text: "First line\nSecond line\nThird line",
          confidence: 0.9,
        }),
      ];
      const result = getOrchestrationRulesInstructions(rules);
      // Multi-line text should be indented for markdown list continuation
      expect(result).toContain("- First line\n  Second line\n  Third line");
    });

    it("includes team-learned description", () => {
      const rules = [makeRule({ ruleId: "r1", text: "Test", confidence: 0.5 })];
      const result = getOrchestrationRulesInstructions(rules);
      expect(result).toContain("learned from previous orchestration runs");
    });
  });
});
