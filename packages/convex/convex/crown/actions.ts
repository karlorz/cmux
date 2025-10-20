"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, type LanguageModel } from "ai";
import { ConvexError, v } from "convex/values";
import {
  CrownEvaluationResponseSchema,
  CrownSummarizationResponseSchema,
  type CrownEvaluationCandidate,
  type CrownEvaluationResponse,
  type CrownSummarizationResponse,
} from "../../../shared/src/convex-safe";
import { env } from "../../_shared/convex-env";
import { action } from "../_generated/server";

const DEFAULT_ANTHROPIC_CROWN_MODEL = "claude-sonnet-4-5-20250929";

const CrownEvaluationCandidateValidator = v.object({
  runId: v.optional(v.string()),
  agentName: v.optional(v.string()),
  modelName: v.optional(v.string()),
  gitDiff: v.string(),
  newBranch: v.optional(v.union(v.string(), v.null())),
  index: v.optional(v.number()),
});

// Claude models that are supported for Crown evaluation
const SUPPORTED_CLAUDE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-1-20250805",
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
];

function resolveCrownModel(configuredModelId?: string): {
  provider: "anthropic";
  model: LanguageModel;
} {
  const anthropicKey = env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new ConvexError(
      "Crown evaluation is not configured (missing Anthropic API key)",
    );
  }

  const anthropic = createAnthropic({ apiKey: anthropicKey });

  // Use configured model if provided and valid, otherwise use default
  let modelId = DEFAULT_ANTHROPIC_CROWN_MODEL;
  if (configuredModelId && SUPPORTED_CLAUDE_MODELS.includes(configuredModelId)) {
    modelId = configuredModelId;
  }

  return {
    provider: "anthropic",
    model: anthropic(modelId),
  };
}

export async function performCrownEvaluation(
  prompt: string,
  candidates: CrownEvaluationCandidate[],
  configuredModelId?: string,
  systemPromptAddition?: string,
): Promise<CrownEvaluationResponse> {
  const { model, provider } = resolveCrownModel(configuredModelId);

  const normalizedCandidates = candidates.map((candidate, idx) => {
    const resolvedIndex = candidate.index ?? idx;
    return {
      index: resolvedIndex,
      runId: candidate.runId,
      agentName: candidate.agentName,
      modelName:
        candidate.modelName ??
        candidate.agentName ??
        (candidate.runId ? `run-${candidate.runId}` : undefined) ??
        `candidate-${resolvedIndex}`,
      gitDiff: candidate.gitDiff,
      newBranch: candidate.newBranch ?? null,
    };
  });

  const evaluationData = {
    prompt,
    candidates: normalizedCandidates,
  };

  const evaluationPrompt = `You are evaluating code implementations from different AI models.

Here are the candidates to evaluate:
${JSON.stringify(evaluationData, null, 2)}

NOTE: The git diffs shown contain only actual code changes. Lock files, build artifacts, and other non-essential files have been filtered out.

Analyze these implementations and select the best one based on:
1. Code quality and correctness
2. Completeness of the solution
3. Following best practices
4. Actually having meaningful code changes (if one has no changes, prefer the one with changes)

Respond with a JSON object containing:
- "winner": the index (0-based) of the best implementation
- "reason": a brief explanation of why this implementation was chosen

Example response:
{"winner": 0, "reason": "Model claude/sonnet-4 provided a more complete implementation with better error handling and cleaner code structure."}

IMPORTANT: Respond ONLY with the JSON object, no other text.`;

  // Use custom system prompt if provided, otherwise use default
  const systemPrompt = systemPromptAddition
    ? systemPromptAddition
    : "You select the best implementation from structured diff inputs and explain briefly why.";

  try {
    const { object } = await generateObject({
      model,
      schema: CrownEvaluationResponseSchema,
      system: systemPrompt,
      prompt: evaluationPrompt,
      temperature: 0,
      maxRetries: 2,
    });

    return CrownEvaluationResponseSchema.parse(object);
  } catch (error) {
    console.error("[convex.crown] Evaluation error", error);
    throw new ConvexError("Evaluation failed");
  }
}

export async function performCrownSummarization(
  prompt: string,
  gitDiff: string,
  configuredModelId?: string,
  systemPromptAddition?: string,
): Promise<CrownSummarizationResponse> {
  const { model, provider } = resolveCrownModel(configuredModelId);

  const summarizationPrompt = `You are an expert reviewer summarizing a pull request.

GOAL
- Explain succinctly what changed and why.
- Call out areas the user should review carefully.
- Provide a quick test plan to validate the changes.

CONTEXT
- User's original request:
${prompt}
- Relevant diffs (unified):
${gitDiff || "<no code changes captured>"}

INSTRUCTIONS
- Base your summary strictly on the provided diffs and request.
- Be specific about files and functions when possible.
- Prefer clear bullet points over prose. Keep it under ~300 words.
- If there are no code changes, say so explicitly and suggest next steps.

OUTPUT FORMAT (Markdown)
## PR Review Summary
- What Changed: bullet list
- Review Focus: bullet list (risks/edge cases)
- Test Plan: bullet list of practical steps
- Follow-ups: optional bullets if applicable
`;

  // Use custom system prompt if provided, otherwise use default
  const systemPrompt = systemPromptAddition
    ? systemPromptAddition
    : "You are an expert reviewer summarizing pull requests. Provide a clear, concise summary following the requested format.";

  try {
    const { object } = await generateObject({
      model,
      schema: CrownSummarizationResponseSchema,
      system: systemPrompt,
      prompt: summarizationPrompt,
      temperature: 0,
      maxRetries: 2,
    });

    return CrownSummarizationResponseSchema.parse(object);
  } catch (error) {
    console.error("[convex.crown] Summarization error", error);
    throw new ConvexError("Summarization failed");
  }
}

export const evaluate = action({
  args: {
    prompt: v.string(),
    candidates: v.array(CrownEvaluationCandidateValidator),
    teamSlugOrId: v.string(),
    crownModelId: v.optional(v.string()),
    crownSystemPromptAddition: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return performCrownEvaluation(
      args.prompt,
      args.candidates,
      args.crownModelId,
      args.crownSystemPromptAddition,
    );
  },
});

export const summarize = action({
  args: {
    prompt: v.string(),
    gitDiff: v.string(),
    teamSlugOrId: v.string(),
    crownModelId: v.optional(v.string()),
    crownSystemPromptAddition: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    return performCrownSummarization(
      args.prompt,
      args.gitDiff,
      args.crownModelId,
      args.crownSystemPromptAddition,
    );
  },
});
