import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

import { collectPrDiffs } from "@/scripts/pr-review-heatmap";
import { env } from "@/lib/utils/www-env";
import {
  SimpleReviewParser,
  type SimpleReviewParsedEvent,
} from "./simple-review-parser";

const SIMPLE_REVIEW_INSTRUCTIONS = `Dannotate every modified/deleted/added line of this diff with a "fake" comment at the end of each line.

For each line, you should add a comment at the end like so:
# "<mostImportantWord>" "<comment>" "<score 0-100>"

Goal is to build a heatmap to guide me through a code review, like where i should focus my eyes on.
So not necessarily where the mistakes are but which parts of the code might require more investigation
So we need to highlight non-clean code, hacky code, suspicious code, duplicated functions, etc, stuff like that.
Anything that feels like it might be off or might warrant a comment should have a high score, even if it's technically correct.
shouldReviewWhy should be a concise (4-10 words) hint on why the reviewer should maybe review this line of code, but it shouldn't state obvious things, instead It should only be a hint for the reviewer as to what exactly you meant when you flagged it.
In most cases, the reason should follow a template like "<X> <verb> <Y>" (eg. "line is too long" or "code accesses sensitive data").
It should be understandable by a human and make sense (break the "X is Y" rule if it helps you make it more understandable).
mostImportantWord must always be provided and should identify the most critical word or identifier in the line. If you're unsure, pick the earliest relevant word or token.
Ugly code should be given a higher score.
Code that may be hard to read for a human should also be given a higher score.
Non-clean code too. Type casts, type assertions, type guards, "any" types, untyped bodies to "fetch" etc. should be given a higher score.
If a line is perfectly normal, you should give it a score of 0.
Only add comments for lines that are modified/deleted/added.

DO NOT BE LAZY DO THE ENTIRE FILE. FROM START TO FINISH. DO NOT BE LAZY.`;

export type SimpleReviewStreamOptions = {
  prIdentifier: string;
  githubToken: string;
  onChunk?: (chunk: string) => void | Promise<void>;
  onEvent?: (event: SimpleReviewParsedEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export type SimpleReviewStreamResult = {
  diffCharacterCount: number;
  finalText: string;
};

export async function runSimpleAnthropicReviewStream(
  options: SimpleReviewStreamOptions
): Promise<SimpleReviewStreamResult> {
  const { prIdentifier, githubToken, onChunk, signal } = options;
  const onEvent = options.onEvent ?? null;
  console.info("[simple-review] Collecting PR diffs", { prIdentifier });

  if (signal?.aborted) {
    console.warn("[simple-review] Aborted before diff collection", {
      prIdentifier,
    });
    throw new Error("Stream aborted before start");
  }

  const { fileDiffs, metadata } = await collectPrDiffs({
    prIdentifier,
    githubToken,
    includePaths: [],
    maxFiles: null,
  });

  const combinedDiff = fileDiffs.map((diff) => diff.diffText).join("\n\n");
  const diffCharacterCount = combinedDiff.length;

  if (combinedDiff.trim().length === 0) {
    console.warn("[simple-review] No diff content available", {
      prIdentifier,
      fileCount: fileDiffs.length,
    });
  }

  const anthropic = createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const prLabel =
    metadata.prUrl ??
    `${metadata.owner}/${metadata.repo}#${metadata.number ?? "unknown"}`;

  const prompt = `GitHub diff for ${prLabel}:\n\n${combinedDiff}\n\n${SIMPLE_REVIEW_INSTRUCTIONS}`;

  console.info("[simple-review] Starting Anthropics stream", {
    prIdentifier,
    prLabel,
    diffCharacterCount,
  });

  let aborted = false;
  const handleAbort = () => {
    aborted = true;
  };
  if (signal) {
    signal.addEventListener("abort", handleAbort, { once: true });
  }

  const parser = new SimpleReviewParser();

  const result = streamText({
    model: anthropic("claude-opus-4-1-20250805"),
    prompt,
    temperature: 0,
    maxRetries: 2,
  });

  let finalText = "";

  try {
    for await (const delta of result.textStream) {
      if (aborted) {
        console.warn("[simple-review] Stream aborted mid-flight", {
          prIdentifier,
        });
        throw new Error("Stream aborted");
      }
      if (delta.length === 0) {
        continue;
      }
      finalText += delta;

      if (onChunk) {
        await onChunk(delta);
      } else {
        console.debug("[simple-review][chunk]", delta);
      }

      const events = parser.push(delta);
      if (onEvent && events.length > 0) {
        for (const event of events) {
          await onEvent(event);
        }
      }
    }

    const remaining = parser.flush();
    if (onEvent && remaining.length > 0) {
      for (const event of remaining) {
        await onEvent(event);
      }
    }
  } catch (error) {
    console.error("[simple-review] Stream interrupted", {
      prIdentifier,
      error,
    });
    throw error;
  } finally {
    if (signal) {
      signal.removeEventListener("abort", handleAbort);
    }
  }

  console.info("[simple-review] Stream completed", {
    prIdentifier,
    finalLength: finalText.length,
  });

  return {
    diffCharacterCount,
    finalText,
  };
}
