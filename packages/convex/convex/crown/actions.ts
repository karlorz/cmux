"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { ConvexError, v } from "convex/values";
import {
  CrownEvaluationResponseSchema,
  CrownSummarizationResponseSchema,
  type CrownEvaluationCandidate,
  type CrownEvaluationResponse,
  type CrownSummarizationResponse,
} from "../../../shared/src/convex-safe";
import {
  CROWN_HARNESS_MAP,
  DEFAULT_CROWN_HARNESS_ID,
  DEFAULT_CROWN_SYSTEM_PROMPT,
  type CrownHarnessConfig,
  type CrownHarnessId,
} from "../../../shared/src/crown";
import { env } from "../../_shared/convex-env";
import { api, internal } from "../_generated/api";
import { action, type ActionCtx } from "../_generated/server";

const CrownEvaluationCandidateValidator = v.object({
  runId: v.optional(v.string()),
  agentName: v.optional(v.string()),
  modelName: v.optional(v.string()),
  gitDiff: v.string(),
  newBranch: v.optional(v.union(v.string(), v.null())),
  index: v.optional(v.number()),
});

const DEFAULT_HARNESS = CROWN_HARNESS_MAP[DEFAULT_CROWN_HARNESS_ID];

type ApiKeyMap = Record<string, string>;

interface CrownModelPreferences {
  harness: CrownHarnessConfig;
  modelId: string;
  systemPrompt: string;
  userApiKeys: ApiKeyMap;
}

const EMPTY_API_KEY_MAP: ApiKeyMap = Object.freeze({}) as ApiKeyMap;

type CrownModelResolutionOptions = {
  harness: CrownHarnessConfig;
  modelId: string;
  userApiKeys: ApiKeyMap;
};

function isCrownHarnessId(value: unknown): value is CrownHarnessId {
  return typeof value === "string" && value in CROWN_HARNESS_MAP;
}

function resolveCrownModel(
  options: CrownModelResolutionOptions,
): {
  provider: CrownHarnessConfig["provider"];
  model: LanguageModel;
} {
  const { harness, modelId, userApiKeys } = options;

  const userApiKey = harness.requiredApiKeyEnvVar
    ? userApiKeys[harness.requiredApiKeyEnvVar] ?? undefined
    : undefined;

  const fallbackKey =
    harness.provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;

  const apiKey =
    userApiKey ?? (harness.allowsSystemFallback ? fallbackKey : undefined);

  if (!apiKey) {
    throw new ConvexError(
      `Crown evaluation is not configured for ${harness.label} (missing API key)`,
    );
  }

  if (harness.provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return { provider: "openai", model: openai(modelId) };
  }

  const anthropic = createAnthropic({ apiKey });
  return { provider: "anthropic", model: anthropic(modelId) };
}

async function loadCrownPreferences(
  ctx: ActionCtx,
  args: {
    teamSlugOrId: string;
    teamId?: string;
    userId?: string | null;
  },
): Promise<CrownModelPreferences> {
  const identity = await ctx.auth.getUserIdentity();
  const effectiveUserId = args.userId ?? identity?.subject ?? null;

  let teamId = args.teamId;
  if (!teamId) {
    const team = await ctx.runQuery(api.teams.get, {
      teamSlugOrId: args.teamSlugOrId,
    });
    teamId = team?.uuid ?? args.teamSlugOrId;
  }

  let workspaceSettings: {
    crownHarness?: string | null;
    crownModel?: string | null;
    crownSystemPrompt?: string | null;
  } | null = null;

  if (teamId && effectiveUserId) {
    workspaceSettings = await ctx.runQuery(
      internal.workspaceSettings.getByTeamAndUserInternal,
      {
        teamId,
        userId: effectiveUserId,
      },
    );
  }

  const userApiKeys =
    teamId && effectiveUserId
      ? (
          await ctx.runQuery(internal.apiKeys.getByTeamAndUserInternal, {
            teamId,
            userId: effectiveUserId,
          })
        ).reduce<ApiKeyMap>((map, key) => {
          map[key.envVar] = key.value;
          return map;
        }, Object.create(null) as ApiKeyMap)
      : EMPTY_API_KEY_MAP;

  const selectedHarnessId = workspaceSettings?.crownHarness ?? undefined;
  const harnessId = isCrownHarnessId(selectedHarnessId)
    ? selectedHarnessId
    : DEFAULT_CROWN_HARNESS_ID;
  let harness = CROWN_HARNESS_MAP[harnessId] ?? DEFAULT_HARNESS;

  if (
    harness.requiredApiKeyEnvVar &&
    !userApiKeys[harness.requiredApiKeyEnvVar] &&
    !harness.allowsSystemFallback
  ) {
    harness = DEFAULT_HARNESS;
  }

  const trimmedModel = workspaceSettings?.crownModel?.trim() ?? "";
  const modelId = trimmedModel.length > 0 ? trimmedModel : harness.defaultModel;

  const systemPromptRaw = workspaceSettings?.crownSystemPrompt ?? "";
  const systemPrompt =
    systemPromptRaw.trim().length > 0
      ? systemPromptRaw
      : DEFAULT_CROWN_SYSTEM_PROMPT;

  return {
    harness,
    modelId,
    systemPrompt,
    userApiKeys,
  };
}

export async function performCrownEvaluation(
  prompt: string,
  candidates: CrownEvaluationCandidate[],
  preferences?: CrownModelPreferences,
): Promise<CrownEvaluationResponse> {
  const effectivePreferences =
    preferences ?? {
      harness: DEFAULT_HARNESS,
      modelId: DEFAULT_HARNESS.defaultModel,
      systemPrompt: DEFAULT_CROWN_SYSTEM_PROMPT,
      userApiKeys: EMPTY_API_KEY_MAP,
    };

  const { model, provider } = resolveCrownModel({
    harness: effectivePreferences.harness,
    modelId: effectivePreferences.modelId,
    userApiKeys: effectivePreferences.userApiKeys,
  });

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
      model,
      schema: CrownEvaluationResponseSchema,
      system: effectivePreferences.systemPrompt,
      prompt: evaluationPrompt,
      ...(provider === "openai" ? {} : { temperature: 0 }),
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
  preferences?: CrownModelPreferences,
): Promise<CrownSummarizationResponse> {
  const effectivePreferences =
    preferences ?? {
      harness: DEFAULT_HARNESS,
      modelId: DEFAULT_HARNESS.defaultModel,
      systemPrompt: DEFAULT_CROWN_SYSTEM_PROMPT,
      userApiKeys: EMPTY_API_KEY_MAP,
    };

  const { model, provider } = resolveCrownModel({
    harness: effectivePreferences.harness,
    modelId: effectivePreferences.modelId,
    userApiKeys: effectivePreferences.userApiKeys,
  });

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
      model,
      schema: CrownSummarizationResponseSchema,
      system:
        "You are an expert reviewer summarizing pull requests. Provide a clear, concise summary following the requested format.",
      prompt: summarizationPrompt,
      ...(provider === "openai" ? {} : { temperature: 0 }),
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
    teamId: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const preferences = await loadCrownPreferences(ctx, {
      teamSlugOrId: args.teamSlugOrId,
      teamId: args.teamId ?? undefined,
      userId: args.userId ?? null,
    });
    return performCrownEvaluation(
      args.prompt,
      args.candidates,
      preferences,
    );
  },
});

export const summarize = action({
  args: {
    prompt: v.string(),
    gitDiff: v.string(),
    teamSlugOrId: v.string(),
    teamId: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const preferences = await loadCrownPreferences(ctx, {
      teamSlugOrId: args.teamSlugOrId,
      teamId: args.teamId ?? undefined,
      userId: args.userId ?? null,
    });
    return performCrownSummarization(args.prompt, args.gitDiff, preferences);
  },
});
