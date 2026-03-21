import { OpenAPIHono, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import {
  parseModelConfigFromUrlSearchParams,
  parseTooltipLanguageFromUrlSearchParams,
} from "../services/code-review/model-config";
import { runSimpleAnthropicReviewStream } from "../services/code-review/run-simple-anthropic-review";
import { getUserFromRequest } from "../utils/auth";
import { FileDiffSchema } from "./code-review.schemas";

const JSON_CONTENT_TYPE = "application/json";

const isJsonContentType = (
  contentType: string | null | undefined,
): boolean =>
  typeof contentType === "string" &&
  contentType.toLowerCase().includes(JSON_CONTENT_TYPE);

const SimpleReviewBodySchema = z
  .object({
    fileDiffs: z.array(FileDiffSchema).min(1),
    diffLabel: z.string().optional(),
  })
  .openapi("CodeReviewSimpleBody");

export const codeReviewSimpleRouter = new OpenAPIHono();

codeReviewSimpleRouter.post("/code-review/simple", async (c) => {
  const user = await getUserFromRequest(c.req.raw);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const { accessToken } = await user.getAuthJson();
  if (!accessToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!isJsonContentType(c.req.header("content-type"))) {
    return c.json({ error: "Content-Type must be application/json" }, 415);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await c.req.json();
  } catch (error) {
    console.error("[simple-review][api] Failed to parse request body", error);
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const bodyResult = SimpleReviewBodySchema.safeParse(parsedBody);
  if (!bodyResult.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const body = bodyResult.data;
  const searchParams = new URL(c.req.raw.url).searchParams;
  const modelConfig = parseModelConfigFromUrlSearchParams(searchParams);
  const tooltipLanguage = parseTooltipLanguageFromUrlSearchParams(searchParams);
  const diffLabel =
    typeof body.diffLabel === "string" && body.diffLabel.trim().length > 0
      ? body.diffLabel.trim()
      : "cmux-diff-review";

  console.info("[simple-review][api] Diff review request", {
    diffLabel,
    fileCount: body.fileDiffs.length,
    model: searchParams.get("model") ?? "default",
    tooltipLanguage,
  });

  return streamSSE(c, async (stream) => {
    let isClosed = false;

    const enqueue = async (payload: unknown) => {
      if (isClosed) {
        return;
      }
      try {
        await stream.writeSSE({
          data: JSON.stringify(payload),
        });
      } catch (error) {
        console.error("[simple-review][api] Failed to write SSE payload", error);
        isClosed = true;
      }
    };

    await enqueue({ type: "status", message: "starting" });

    try {
      await runSimpleAnthropicReviewStream({
        prIdentifier: diffLabel,
        fileDiffs: body.fileDiffs,
        modelConfig,
        tooltipLanguage,
        signal: c.req.raw.signal,
        onEvent: async (event) => {
          switch (event.type) {
            case "file":
              await enqueue({
                type: "file",
                filePath: event.filePath,
              });
              break;
            case "skip":
              await enqueue({
                type: "skip",
                filePath: event.filePath,
                reason: event.reason,
              });
              break;
            case "hunk":
              await enqueue({
                type: "hunk",
                filePath: event.filePath,
                header: event.header,
              });
              break;
            case "file-complete":
              await enqueue({
                type: "file-complete",
                filePath: event.filePath,
                status: event.status,
                summary: event.summary,
              });
              break;
            case "line":
              await enqueue({
                type: "line",
                filePath: event.filePath,
                changeType: event.line.changeType,
                diffLine: event.line.diffLine,
                codeLine: event.line.codeLine,
                mostImportantWord: event.line.mostImportantWord,
                shouldReviewWhy: event.line.shouldReviewWhy,
                score: event.line.score,
                scoreNormalized: event.line.scoreNormalized,
                oldLineNumber: event.line.oldLineNumber,
                newLineNumber: event.line.newLineNumber,
                line: event.line,
              });
              break;
            default:
              break;
          }
        },
      });

      await enqueue({ type: "complete" });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Review stream failed unexpectedly";
      const isAbortError =
        message.includes("Stream aborted") || message.includes("aborted");
      if (isAbortError) {
        console.info("[simple-review][api] Stream aborted by client", {
          diffLabel,
        });
      } else {
        console.error("[simple-review][api] Stream failed", {
          diffLabel,
          message,
          error,
        });
      }
      await enqueue({ type: "error", message });
    } finally {
      if (!isClosed) {
        isClosed = true;
        stream.close();
      }
    }
  });
});
