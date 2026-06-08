#!/usr/bin/env bun
/**
 * Codex Model Catalog Sync
 *
 * Extracts model metadata from `codex app-server` JSON-RPC and generates
 * a TypeScript catalog file for cmux.
 *
 * Usage:
 *   bun run scripts/sync-codex-models.ts [--dry-run] [--verbose]
 *
 * The script:
 * 1. Spawns `codex app-server` and sends JSON-RPC initialize + model/list
 * 2. Parses the response to extract model metadata
 * 3. Generates packages/shared/src/providers/openai/catalog.generated.ts
 *
 * No authentication required - app-server returns public model catalog.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Types matching the Codex JSON-RPC response
interface ReasoningEffortOption {
  reasoningEffort: string;
  description: string;
}

interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  isDefault: boolean;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: ReasoningEffortOption[];
  inputModalities?: string[];
  supportsPersonality?: boolean;
  upgrade?: string | null;
  upgradeInfo?: {
    model: string;
    upgradeCopy?: string | null;
    migrationMarkdown?: string | null;
    modelLink?: string | null;
  } | null;
  availabilityNux?: {
    message: string;
  } | null;
}

interface ModelListResponse {
  data: CodexModel[];
  nextCursor?: string | null;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string;
}

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

function log(msg: string) {
  console.log(`[sync-codex-models] ${msg}`);
}

function verbose(msg: string) {
  if (VERBOSE) {
    console.log(`[sync-codex-models] ${msg}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJsonRpcError(
  value: unknown,
): value is { code: number; message: string } {
  return (
    isRecord(value) &&
    typeof value.code === "number" &&
    typeof value.message === "string"
  );
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return (
    isRecord(value) &&
    (typeof value.id === "number" || value.id === undefined) &&
    (value.error === undefined || isJsonRpcError(value.error)) &&
    (typeof value.method === "string" || value.method === undefined)
  );
}

function isReasoningEffortOption(
  value: unknown,
): value is ReasoningEffortOption {
  return (
    isRecord(value) &&
    typeof value.reasoningEffort === "string" &&
    typeof value.description === "string"
  );
}

function isCodexModel(value: unknown): value is CodexModel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.model === "string" &&
    typeof value.displayName === "string" &&
    typeof value.description === "string" &&
    typeof value.hidden === "boolean" &&
    typeof value.isDefault === "boolean" &&
    typeof value.defaultReasoningEffort === "string" &&
    Array.isArray(value.supportedReasoningEfforts) &&
    value.supportedReasoningEfforts.every(isReasoningEffortOption) &&
    (value.inputModalities === undefined ||
      (Array.isArray(value.inputModalities) &&
        value.inputModalities.every(
          (modality) => typeof modality === "string",
        ))) &&
    (value.upgrade === undefined ||
      value.upgrade === null ||
      typeof value.upgrade === "string")
  );
}

function isModelListResponse(value: unknown): value is ModelListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isCodexModel) &&
    (value.nextCursor === undefined ||
      value.nextCursor === null ||
      typeof value.nextCursor === "string")
  );
}

async function fetchModelsFromAppServer(): Promise<CodexModel[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("codex", ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderr = "";
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        finishWithError(new Error("Timeout waiting for codex app-server"));
      }
    }, 15000);

    function finishWithError(error: Error) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      proc.kill("SIGTERM");
      reject(error);
    }

    function finishWithModels(models: CodexModel[]) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      proc.kill("SIGTERM");
      resolve(models);
    }

    function writeMessage(message: unknown) {
      if (!proc.stdin.writable) {
        finishWithError(
          new Error("codex app-server stdin closed unexpectedly"),
        );
        return;
      }
      proc.stdin.write(JSON.stringify(message) + "\n");
    }

    function handleResponse(resp: JsonRpcResponse) {
      if (resp.error) {
        finishWithError(
          new Error(`codex app-server error: ${resp.error.message}`),
        );
        return;
      }

      if (resp.id === 1) {
        writeMessage({ method: "initialized" });
        writeMessage({
          id: 2,
          method: "model/list",
          params: { includeHidden: true },
        });
        return;
      }

      if (resp.id === 2) {
        if (!isModelListResponse(resp.result)) {
          finishWithError(
            new Error(
              "codex app-server returned an invalid model/list response",
            ),
          );
          return;
        }
        finishWithModels(resp.result.data);
      }
    }

    function handleStdoutLine(line: string) {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line) as unknown;
        if (!isJsonRpcResponse(parsed)) {
          verbose(
            `Ignoring unrecognized app-server line: ${line.substring(0, 100)}`,
          );
          return;
        }
        handleResponse(parsed);
      } catch (err) {
        verbose(
          `Ignoring non-JSON app-server line: ${line.substring(0, 100)} (${String(err)})`,
        );
      }
    }

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdoutBuffer += chunk;
      verbose(`stdout chunk: ${chunk.substring(0, 100)}...`);

      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        handleStdoutLine(line);
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const initializeMsg = {
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "cmux-sync", version: "1.0" },
        capabilities: null,
      },
    };

    proc.on("close", () => {
      if (resolved) return;
      handleStdoutLine(stdoutBuffer);
      if (resolved) return;
      finishWithError(new Error(`Failed to get model list. stderr: ${stderr}`));
    });

    proc.on("error", (err) => {
      finishWithError(err);
    });

    proc.stdin.on("error", (err) => {
      finishWithError(err);
    });

    writeMessage(initializeMsg);
  });
}

function generateCatalogFile(models: CodexModel[]): string {
  // Sort: visible models first, then by displayName
  const sortedModels = [...models].sort((a, b) => {
    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });

  const entries = sortedModels.map((m) => {
    const tags: string[] = [];
    if (m.isDefault) tags.push("default");
    if (m.hidden) tags.push("hidden");
    if (m.upgrade) tags.push("upgradeable");
    if (
      m.supportedReasoningEfforts.some((e) => e.reasoningEffort === "xhigh")
    ) {
      tags.push("reasoning");
    }

    // Build variants from supportedReasoningEfforts
    const variants = m.supportedReasoningEfforts.map((e) => ({
      id: e.reasoningEffort,
      displayName: formatEffortDisplayName(e.reasoningEffort),
      description: e.description,
    }));

    return {
      name: `codex/${m.model}`,
      displayName: m.displayName,
      description: m.description,
      vendor: "openai" as const,
      requiredApiKeys: ["OPENAI_API_KEY", "CODEX_AUTH_JSON"],
      tier: "paid" as const,
      tags,
      hidden: m.hidden,
      isDefault: m.isDefault,
      defaultVariant: m.defaultReasoningEffort,
      variants,
      upgrade: m.upgrade ?? undefined,
      inputModalities: m.inputModalities,
    };
  });

  const code = `// AUTO-GENERATED by scripts/sync-codex-models.ts
// Do not edit manually - run 'bun run scripts/sync-codex-models.ts' to update

import type { AgentCatalogEntry } from "../../agent-catalog";

export interface CodexModelEntry extends AgentCatalogEntry {
  /** Whether this model is hidden from the default picker */
  hidden?: boolean;
  /** Whether this is the default model */
  isDefault?: boolean;
  /** Model ID to upgrade to (if deprecated) */
  upgrade?: string;
  /** Input modalities supported */
  inputModalities?: string[];
}

/**
 * Full Codex model catalog extracted from codex app-server.
 * Includes all models (visible and hidden).
 */
export const CODEX_CATALOG_GENERATED: CodexModelEntry[] = ${JSON.stringify(entries, null, 2)};

/**
 * Visible models only (for default UI display)
 */
export const CODEX_VISIBLE_MODELS = CODEX_CATALOG_GENERATED.filter(m => !m.hidden);

/**
 * Get the default Codex model
 */
export function getDefaultCodexModel(): CodexModelEntry | undefined {
  return CODEX_CATALOG_GENERATED.find(m => m.isDefault);
}

/**
 * Get model by name
 */
export function getCodexModel(name: string): CodexModelEntry | undefined {
  return CODEX_CATALOG_GENERATED.find(m => m.name === name || m.name === \`codex/\${name}\`);
}
`;

  return code;
}

function formatEffortDisplayName(effort: string): string {
  const map: Record<string, string> = {
    none: "No Reasoning",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
  };
  return map[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
}

async function main() {
  log("Fetching models from codex app-server...");

  try {
    const models = await fetchModelsFromAppServer();
    log(`Found ${models.length} models`);

    if (VERBOSE) {
      for (const m of models) {
        console.log(
          `  - ${m.model} (${m.displayName})${m.hidden ? " [hidden]" : ""}`,
        );
      }
    }

    const catalogCode = generateCatalogFile(models);
    const outputPath = path.join(
      import.meta.dirname,
      "../packages/shared/src/providers/openai/catalog.generated.ts",
    );

    if (DRY_RUN) {
      log("Dry run - would write to:");
      log(outputPath);
      console.log("\n--- Generated content ---\n");
      console.log(catalogCode);
    } else {
      fs.writeFileSync(outputPath, catalogCode);
      log(`Wrote ${outputPath}`);
    }
  } catch (err) {
    console.error("[sync-codex-models] Error:", err);
    process.exit(1);
  }
}

main();
