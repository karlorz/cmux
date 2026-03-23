/**
 * Agent Instruction Pack Builder
 *
 * Centralizes instruction assembly that was previously duplicated across
 * 8 provider environment files. Each provider now calls this module
 * instead of building policyRulesSection, orchestrationRulesSection,
 * and behaviorRulesSection independently.
 *
 * This follows the simplification plan from:
 * - cmux-agent-platform-simplification-rollout-plan.md (Phase 1)
 *
 * Benefits:
 * - Consistent instruction ordering across all providers
 * - Single point of maintenance for section assembly
 * - Pack metadata for debugging/observability
 * - Testable without spinning up provider environments
 */

import {
  getPolicyRulesInstructions,
  getOrchestrationRulesInstructions,
  extractBehaviorRulesSection,
  getMemoryProtocolInstructions,
  type PolicyRuleForInstructions,
  type OrchestrationRuleForInstructions,
} from "./agent-memory-protocol";

/**
 * Context required to build an instruction pack.
 * This mirrors the relevant fields from EnvironmentContext.
 */
export interface InstructionPackContext {
  /** Policy rules from Convex (scope: hot, orchestration, project) */
  policyRules?: PolicyRuleForInstructions[];
  /** Orchestration rules learned from previous runs */
  orchestrationRules?: OrchestrationRuleForInstructions[];
  /** Previous behavior HOT.md content for behavior rules extraction */
  previousBehavior?: string;
  /** Whether this is a head/orchestration agent */
  isOrchestrationHead?: boolean;
}

/**
 * Options for customizing instruction pack output.
 */
export interface InstructionPackOptions {
  /** Include memory protocol instructions (default: true) */
  includeMemoryProtocol?: boolean;
  /** Custom prefix content to prepend */
  prefixContent?: string;
  /** Custom suffix content to append */
  suffixContent?: string;
  /** Section separator (default: "\n\n") */
  sectionSeparator?: string;
}

/**
 * Metadata about the built instruction pack for observability.
 */
export interface InstructionPackMetadata {
  /** Number of policy rules included */
  policyRuleCount: number;
  /** Number of orchestration rules included */
  orchestrationRuleCount: number;
  /** Whether behavior rules were extracted */
  hasBehaviorRules: boolean;
  /** Whether memory protocol was included */
  hasMemoryProtocol: boolean;
  /** Total byte size of the pack */
  byteSize: number;
  /** Number of non-empty sections */
  sectionCount: number;
}

/**
 * Result of building an instruction pack.
 */
export interface InstructionPackResult {
  /** The assembled instruction content */
  content: string;
  /** Metadata about the pack */
  metadata: InstructionPackMetadata;
  /** Individual sections for providers that need them separately */
  sections: {
    policyRules: string;
    orchestrationRules: string;
    behaviorRules: string;
    memoryProtocol: string;
  };
}

/**
 * Build an instruction pack from the given context.
 *
 * This is the central function that replaces duplicated instruction
 * assembly in provider environment files.
 *
 * @param ctx - Context with rules and behavior content
 * @param options - Customization options
 * @returns The assembled instruction pack with metadata
 *
 * @example
 * ```ts
 * const pack = buildInstructionPack({
 *   policyRules: ctx.policyRules,
 *   orchestrationRules: ctx.orchestrationRules,
 *   previousBehavior: ctx.previousBehavior,
 *   isOrchestrationHead: ctx.isOrchestrationHead,
 * });
 *
 * // Use the full content
 * const instructions = pack.content;
 *
 * // Or use individual sections
 * const fullContent = existingContent + pack.sections.policyRules + ...;
 * ```
 */
export function buildInstructionPack(
  ctx: InstructionPackContext,
  options: InstructionPackOptions = {}
): InstructionPackResult {
  const {
    includeMemoryProtocol = true,
    prefixContent,
    suffixContent,
    sectionSeparator = "\n\n",
  } = options;

  // Build individual sections
  const policyRulesSection =
    ctx.policyRules && ctx.policyRules.length > 0
      ? getPolicyRulesInstructions(ctx.policyRules)
      : "";

  const orchestrationRulesSection =
    ctx.orchestrationRules && ctx.orchestrationRules.length > 0
      ? getOrchestrationRulesInstructions(ctx.orchestrationRules, {
          isOrchestrationHead: ctx.isOrchestrationHead,
        })
      : "";

  const behaviorRulesSection = ctx.previousBehavior
    ? extractBehaviorRulesSection(ctx.previousBehavior)
    : "";

  const memoryProtocolSection = includeMemoryProtocol
    ? getMemoryProtocolInstructions()
    : "";

  // Collect non-empty sections in order
  const sections: string[] = [];

  if (prefixContent) {
    sections.push(prefixContent);
  }

  if (policyRulesSection) {
    sections.push(policyRulesSection);
  }

  if (orchestrationRulesSection) {
    sections.push(orchestrationRulesSection);
  }

  if (behaviorRulesSection) {
    sections.push(behaviorRulesSection);
  }

  if (memoryProtocolSection) {
    sections.push(memoryProtocolSection);
  }

  if (suffixContent) {
    sections.push(suffixContent);
  }

  // Assemble content
  const content = sections.join(sectionSeparator);

  // Build metadata
  const metadata: InstructionPackMetadata = {
    policyRuleCount: ctx.policyRules?.length ?? 0,
    orchestrationRuleCount: ctx.orchestrationRules?.length ?? 0,
    hasBehaviorRules: behaviorRulesSection.length > 0,
    hasMemoryProtocol: memoryProtocolSection.length > 0,
    byteSize: Buffer.byteLength(content, "utf-8"),
    sectionCount: sections.length,
  };

  return {
    content,
    metadata,
    sections: {
      policyRules: policyRulesSection,
      orchestrationRules: orchestrationRulesSection,
      behaviorRules: behaviorRulesSection,
      memoryProtocol: memoryProtocolSection,
    },
  };
}

/**
 * Build instruction pack content for Claude Code's CLAUDE.md format.
 *
 * This is a convenience wrapper that formats the pack with the standard
 * header used by Claude Code agents.
 *
 * @param ctx - Context with rules and behavior content
 * @returns Formatted CLAUDE.md content string
 */
export function buildClaudeMdContent(ctx: InstructionPackContext): string {
  const pack = buildInstructionPack(ctx, {
    prefixContent: "# cmux Agent Instructions",
    sectionSeparator: "\n",
  });
  return pack.content;
}

/**
 * Build instruction pack content for Codex instructions.md format.
 *
 * This is a convenience wrapper that appends rules to existing
 * instructions content.
 *
 * @param ctx - Context with rules and behavior content
 * @param existingContent - Existing instructions.md content (optional)
 * @returns Formatted instructions.md content string
 */
export function buildCodexInstructionsContent(
  ctx: InstructionPackContext,
  existingContent?: string
): string {
  const pack = buildInstructionPack(ctx);

  if (existingContent && existingContent.trim()) {
    return existingContent + "\n\n" + pack.content;
  }

  return pack.content;
}

/**
 * Build instruction pack content for Gemini's GEMINI.md format.
 *
 * @param ctx - Context with rules and behavior content
 * @returns Formatted GEMINI.md content string
 */
export function buildGeminiMdContent(ctx: InstructionPackContext): string {
  const pack = buildInstructionPack(ctx, {
    prefixContent: "# cmux Agent Instructions",
    sectionSeparator: "\n",
  });
  return pack.content;
}

/**
 * Build instruction pack content for generic agent formats.
 *
 * @param ctx - Context with rules and behavior content
 * @param header - Optional header line (default: "# cmux Agent Instructions")
 * @returns Formatted content string
 */
export function buildGenericInstructionsContent(
  ctx: InstructionPackContext,
  header: string = "# cmux Agent Instructions"
): string {
  const pack = buildInstructionPack(ctx, {
    prefixContent: header,
    sectionSeparator: "\n",
  });
  return pack.content;
}
