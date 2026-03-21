import { generateText } from "ai";
import { resolveServerPlatformAiModel } from "./platformAi";
import { serverLogger } from "./fileLogger";

export async function generateCommitMessageFromDiff(
  diff: string,
  _teamSlugOrId: string
): Promise<string | null> {
  // Use platform credentials only - not user/team API keys
  const config = resolveServerPlatformAiModel("commit");
  if (!config) {
    serverLogger.warn(
      "[CommitMsg] No platform API keys available, skipping AI generation"
    );
    return null;
  }
  const { model, providerName } = config;

  // Truncate diff to a reasonable size for prompt
  const maxChars = 20000;
  const truncated = diff.length > maxChars ? diff.slice(0, maxChars) : diff;

  const system = [
    "You write high-quality git commit messages using Conventional Commits.",
    "Output only the commit message as plain text.",
    "Structure:",
    "- First line: type(scope?): subject (<=72 chars, imperative mood)",
    "- Optional blank line",
    "- 1-4 bullet points summarizing key changes",
    "Use types: feat, fix, chore, refactor, docs, test, perf, ci, build, style.",
    "Don't include code fences, markdown headers, or extraneous commentary.",
  ].join("\n");

  const examples =
    `Examples:\n\n` +
    [
      "feat(auth): add OAuth login with Google\n\n- Add /auth/google route and callback\n- Store tokens securely; add env vars\n- Update client to handle login state",
      "fix(api): prevent crash on missing user id\n\n- Validate id param before database call\n- Return 400 with error details",
      "chore(deps): bump react and vite to latest",
      "refactor(editor): extract toolbar component and simplify state",
      "docs(readme): clarify setup and add troubleshooting",
      "test(router): add unit tests for nested routes",
    ].join("\n\n");

  const prompt = [
    examples,
    "\n\nDiff (truncated if long):\n",
    "```diff\n",
    truncated,
    "\n```\n",
    "\nWrite a concise, descriptive commit message.",
  ].join("");

  try {
    const { text } = await generateText({
      model,
      system,
      prompt,
      ...(providerName === "OpenAI" ? {} : { temperature: 0.2 }),
      maxRetries: 2,
    });
    const cleaned = text.trim();
    serverLogger.info(
      `[CommitMsg] Generated via ${providerName}: ${cleaned.split("\n")[0]}`
    );
    return cleaned || null;
  } catch (error) {
    serverLogger.error(`[CommitMsg] ${providerName} API error:`, error);
    return null;
  }
}
