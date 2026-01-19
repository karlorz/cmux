"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, type LanguageModel } from "ai";
import { ConvexError, v } from "convex/values";
import {
  CrownEvaluationResponseSchema,
  CrownSummarizationResponseSchema,
  type CrownEvaluationCandidate,
  type CrownEvaluationResponse,
  type CrownSummarizationResponse,
} from "@cmux/shared/convex-safe";
import {
  CLOUDFLARE_OPENAI_BASE_URL,
  CLOUDFLARE_ANTHROPIC_BASE_URL,
  CLOUDFLARE_GEMINI_BASE_URL,
} from "@cmux/shared";
import { action } from "../_generated/server";

const OPENAI_CROWN_MODEL = "gpt-5-mini-2025-08-07";
const ANTHROPIC_CROWN_MODEL = "claude-sonnet-4-5-20250929";
const GEMINI_CROWN_MODEL = "gemini-3-flash-preview";

/** Maximum number of application-level retry attempts for crown evaluation */
const MAX_CROWN_EVALUATION_ATTEMPTS = 3;

/** Base delay in milliseconds for exponential backoff (1s, 2s, 4s) */
const RETRY_BASE_DELAY_MS = 1000;

const CROWN_PROVIDERS = ["openai", "anthropic", "gemini"] as const;
type CrownProvider = (typeof CROWN_PROVIDERS)[number];

/**
 * Sleep for the specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CrownEvaluationCandidateValidator = v.object({
  runId: v.optional(v.string()),
  agentName: v.optional(v.string()),
  modelName: v.optional(v.string()),
  gitDiff: v.string(),
  newBranch: v.optional(v.union(v.string(), v.null())),
  index: v.optional(v.number()),
});

function resolveCrownModel(): {
  provider: CrownProvider;
  model: LanguageModel;
} {
  // Note: AIGATEWAY_* accessed via process.env to avoid Convex static analysis
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const openai = createOpenAI({
      apiKey: openaiKey,
      baseURL: process.env.AIGATEWAY_OPENAI_BASE_URL || CLOUDFLARE_OPENAI_BASE_URL,
    });
    return { provider: "openai", model: openai(OPENAI_CROWN_MODEL) };
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    const anthropic = createAnthropic({
      apiKey: anthropicKey,
      baseURL:
        process.env.AIGATEWAY_ANTHROPIC_BASE_URL || CLOUDFLARE_ANTHROPIC_BASE_URL,
    });
    return {
      provider: "anthropic",
      model: anthropic(ANTHROPIC_CROWN_MODEL),
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const google = createGoogleGenerativeAI({
      apiKey: geminiKey,
      baseURL: process.env.AIGATEWAY_GEMINI_BASE_URL || CLOUDFLARE_GEMINI_BASE_URL,
    });
    return { provider: "gemini", model: google(GEMINI_CROWN_MODEL) };
  }

  throw new ConvexError(
    "Crown evaluation is not configured (missing OpenAI, Anthropic, or Gemini API key)"
  );
}

export async function performCrownEvaluation(
  prompt: string,
  candidates: CrownEvaluationCandidate[]
): Promise<CrownEvaluationResponse> {
  const { model, provider } = resolveCrownModel();

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

  let lastError: Error | unknown = null;

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= MAX_CROWN_EVALUATION_ATTEMPTS; attempt++) {
    try {
      console.info(
        `[convex.crown] Evaluation attempt ${attempt}/${MAX_CROWN_EVALUATION_ATTEMPTS} via ${provider}`
      );

      const { object } = await generateObject({
        model,
        schema: CrownEvaluationResponseSchema,
        system:
          "You select the best implementation from structured diff inputs and explain briefly why.",
        prompt: evaluationPrompt,
        maxRetries: 2,
      });

      console.info(
        `[convex.crown] Evaluation completed via ${provider} on attempt ${attempt}`
      );
      return CrownEvaluationResponseSchema.parse(object);
    } catch (error) {
      lastError = error;
      const errorType =
        error instanceof Error ? error.constructor.name : typeof error;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(
        `[convex.crown] Evaluation attempt ${attempt}/${MAX_CROWN_EVALUATION_ATTEMPTS} failed`,
        {
          provider,
          attempt,
          maxAttempts: MAX_CROWN_EVALUATION_ATTEMPTS,
          errorType,
          errorMessage,
        }
      );

      // If not the last attempt, wait with exponential backoff before retrying
      if (attempt < MAX_CROWN_EVALUATION_ATTEMPTS) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.info(
          `[convex.crown] Waiting ${delayMs}ms before retry attempt ${attempt + 1}`
        );
        await sleep(delayMs);
      }
    }
  }

  // All retry attempts exhausted - trigger graceful fallback
  const fallbackWinner = 0;
  const fallbackReason =
    "Evaluation service unavailable - auto-selected first candidate";

  const errorType =
    lastError instanceof Error ? lastError.constructor.name : typeof lastError;
  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);

  console.warn(`[convex.crown] All ${MAX_CROWN_EVALUATION_ATTEMPTS} evaluation attempts exhausted, using fallback`, {
    provider,
    totalAttempts: MAX_CROWN_EVALUATION_ATTEMPTS,
    finalErrorType: errorType,
    finalErrorMessage: errorMessage,
    fallbackWinner,
    fallbackReason,
  });

  // Return valid CrownEvaluationResponse with fallback selection
  return {
    winner: fallbackWinner,
    reason: fallbackReason,
  };
}

export async function performCrownSummarization(
  prompt: string,
  gitDiff: string
): Promise<CrownSummarizationResponse> {
  const { model, provider } = resolveCrownModel();

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
      maxRetries: 2,
    });

    console.info(`[convex.crown] Summarization completed via ${provider}`);
    return CrownSummarizationResponseSchema.parse(object);
  } catch (error) {
    console.error(`[convex.crown] ${provider} summarization error`, error);
    throw new ConvexError("Summarization failed");
  }
}

export const evaluate = action({
  args: {
    prompt: v.string(),
    candidates: v.array(CrownEvaluationCandidateValidator),
    teamSlugOrId: v.string(),
  },
  handler: async (_ctx, args) => {
    return performCrownEvaluation(args.prompt, args.candidates);
  },
});

export const summarize = action({
  args: {
    prompt: v.string(),
    gitDiff: v.string(),
    teamSlugOrId: v.string(),
  },
  handler: async (_ctx, args) => {
    return performCrownSummarization(args.prompt, args.gitDiff);
  },
});
