"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { ConvexError, v } from "convex/values";
import {
  CROWN_DEFAULT_MODEL_BY_PROVIDER,
  CROWN_DEFAULT_PROVIDER,
  type CrownModelProvider,
} from "../../../shared/src/crown";
import {
  CrownEvaluationResponseSchema,
  CrownSummarizationResponseSchema,
  type CrownEvaluationCandidate,
  type CrownEvaluationResponse,
  type CrownSummarizationResponse,
} from "../../../shared/src/convex-safe";
import { env } from "../../_shared/convex-env";
import { api } from "../_generated/api";
import { action, type ActionCtx } from "../_generated/server";

const DEFAULT_EVALUATION_SYSTEM_PROMPT =
  "You select the best implementation from structured diff inputs and explain briefly why.";
const DEFAULT_SUMMARIZATION_SYSTEM_PROMPT =
  "You are an expert reviewer summarizing pull requests. Provide a clear, concise summary following the requested format.";

const CrownEvaluationCandidateValidator = v.object({
  runId: v.optional(v.string()),
  agentName: v.optional(v.string()),
  modelName: v.optional(v.string()),
  gitDiff: v.string(),
  newBranch: v.optional(v.union(v.string(), v.null())),
  index: v.optional(v.number()),
});

type ApiKeyMap = Record<string, string | undefined>;

type CrownSelection = {
  provider: CrownModelProvider;
  modelId: string;
};

type CrownRuntimeConfig = {
  model: LanguageModel;
  provider: CrownModelProvider;
  evaluationSystemPrompt: string;
  summarizationSystemPrompt: string;
};

function mergeApiKeysWithEnv(
  keys: Record<string, string> | null | undefined,
): ApiKeyMap {
  const merged: ApiKeyMap = { ...(keys ?? {}) };

  if (!merged.OPENAI_API_KEY && env.OPENAI_API_KEY) {
    merged.OPENAI_API_KEY = env.OPENAI_API_KEY;
  }
  if (!merged.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY) {
    merged.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  }

  return merged;
}

function normalizeProvider(value: unknown): CrownModelProvider {
  return value === "openai" ? "openai" : "anthropic";
}

function normalizeModel(
  provider: CrownModelProvider,
  value: unknown,
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return CROWN_DEFAULT_MODEL_BY_PROVIDER[provider];
}

function getEvaluationSystemPrompt(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return DEFAULT_EVALUATION_SYSTEM_PROMPT;
}

function createModelFromSelection(
  selection: CrownSelection,
  apiKeys: ApiKeyMap,
): { provider: CrownModelProvider; model: LanguageModel } | null {
  if (selection.provider === "openai") {
    const apiKey = apiKeys.OPENAI_API_KEY;
    if (!apiKey) return null;
    const openai = createOpenAI({ apiKey });
    return { provider: "openai", model: openai(selection.modelId) };
  }

  const apiKey = apiKeys.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = createAnthropic({ apiKey });
  return { provider: "anthropic", model: anthropic(selection.modelId) };
}

function resolveModelOrThrow(
  selection: CrownSelection,
  apiKeys: ApiKeyMap,
): { provider: CrownModelProvider; model: LanguageModel } {
  const attempts: CrownSelection[] = [];
  const seen = new Set<string>();

  const addAttempt = (candidate: CrownSelection) => {
    const key = `${candidate.provider}:${candidate.modelId}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push(candidate);
  };

  addAttempt(selection);

  const defaultSelection: CrownSelection = {
    provider: CROWN_DEFAULT_PROVIDER,
    modelId: CROWN_DEFAULT_MODEL_BY_PROVIDER[CROWN_DEFAULT_PROVIDER],
  };
  addAttempt(defaultSelection);

  (Object.keys(CROWN_DEFAULT_MODEL_BY_PROVIDER) as CrownModelProvider[]).forEach(
    (provider) => {
      addAttempt({
        provider,
        modelId: CROWN_DEFAULT_MODEL_BY_PROVIDER[provider],
      });
    },
  );

  for (const attempt of attempts) {
    const resolved = createModelFromSelection(attempt, apiKeys);
    if (resolved) {
      if (
        attempt.provider !== selection.provider ||
        attempt.modelId !== selection.modelId
      ) {
        console.warn(
          `[convex.crown] Falling back to ${attempt.provider}/${attempt.modelId} for crown evaluation.`,
        );
      }
      return resolved;
    }
  }

  throw new ConvexError(
    "Crown evaluation is not configured (missing OpenAI or Anthropic API key)",
  );
}

async function resolveRuntimeConfig(
  ctx: ActionCtx,
  teamSlugOrId: string,
): Promise<CrownRuntimeConfig> {
  const [workspaceSettings, apiKeys] = await Promise.all([
    ctx.runQuery(api.workspaceSettings.get, { teamSlugOrId }),
    ctx.runQuery(api.apiKeys.getAllForAgents, { teamSlugOrId }),
  ]);

  const provider = normalizeProvider(
    (workspaceSettings as { crownEvaluatorProvider?: CrownModelProvider } | null)
      ?.crownEvaluatorProvider,
  );
  const modelId = normalizeModel(
    provider,
    (workspaceSettings as { crownEvaluatorModel?: string } | null)
      ?.crownEvaluatorModel,
  );
  const mergedApiKeys = mergeApiKeysWithEnv(apiKeys);
  const { provider: resolvedProvider, model } = resolveModelOrThrow(
    { provider, modelId },
    mergedApiKeys,
  );

  const evaluationSystemPrompt = getEvaluationSystemPrompt(
    (workspaceSettings as { crownEvaluatorSystemPrompt?: string } | null)
      ?.crownEvaluatorSystemPrompt,
  );

  return {
    model,
    provider: resolvedProvider,
    evaluationSystemPrompt,
    summarizationSystemPrompt: DEFAULT_SUMMARIZATION_SYSTEM_PROMPT,
  };
}

export async function performCrownEvaluation(
  prompt: string,
  candidates: CrownEvaluationCandidate[],
  config: {
    model: LanguageModel;
    provider: CrownModelProvider;
    systemPrompt: string;
  },
): Promise<CrownEvaluationResponse> {
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

  try {
    const { object } = await generateObject({
      model: config.model,
      schema: CrownEvaluationResponseSchema,
      system: config.systemPrompt,
      prompt: evaluationPrompt,
      ...(config.provider === "openai" ? {} : { temperature: 0 }),
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
  config: {
    model: LanguageModel;
    provider: CrownModelProvider;
    systemPrompt?: string;
  },
): Promise<CrownSummarizationResponse> {
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

  try {
    const { object } = await generateObject({
      model: config.model,
      schema: CrownSummarizationResponseSchema,
      system: config.systemPrompt ?? DEFAULT_SUMMARIZATION_SYSTEM_PROMPT,
      prompt: summarizationPrompt,
      ...(config.provider === "openai" ? {} : { temperature: 0 }),
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
  },
  handler: async (ctx, args) => {
    const runtimeConfig = await resolveRuntimeConfig(ctx, args.teamSlugOrId);
    return performCrownEvaluation(args.prompt, args.candidates, {
      model: runtimeConfig.model,
      provider: runtimeConfig.provider,
      systemPrompt: runtimeConfig.evaluationSystemPrompt,
    });
  },
});

export const summarize = action({
  args: {
    prompt: v.string(),
    gitDiff: v.string(),
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const runtimeConfig = await resolveRuntimeConfig(ctx, args.teamSlugOrId);
    return performCrownSummarization(args.prompt, args.gitDiff, {
      model: runtimeConfig.model,
      provider: runtimeConfig.provider,
      systemPrompt: runtimeConfig.summarizationSystemPrompt,
    });
  },
});
