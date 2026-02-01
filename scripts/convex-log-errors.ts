#!/usr/bin/env bun
/**
 * Convex Log Error Detection Script
 *
 * Parses local Convex dev logs and Convex Cloud logs to summarize errors.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

interface ConvexLogEntry {
  kind: string;
  udfType: "Query" | "Mutation" | "Action" | "HttpAction" | string;
  identifier: string;
  timestamp: number;
  success: unknown | null;
  error: string | null;
  logLines: Array<{ messages: string[]; level: string; timestamp: number }>;
  executionTime: number;
  requestId: string;
}

type UdfType = "Query" | "Mutation" | "Action" | "HttpAction" | "Unknown";

type SourceType = "file" | "cloud";

interface ConvexError {
  timestamp: Date;
  type: UdfType;
  functionName: string;
  errorMessage: string;
  source: SourceType;
  location?: string;
  requestId?: string;
}

interface AggregatedError {
  errorMessage: string;
  functionName: string;
  type: UdfType;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  source: SourceType;
  location?: string;
}

interface Options {
  cloudOnly: boolean;
  localOnly: boolean;
  filePath: string;
  history: number;
  filter?: string;
  aggregate: boolean;
  json: boolean;
}

interface SourceResult {
  label: string;
  source: SourceType;
  errors: ConvexError[];
  aggregated: AggregatedError[];
  errorMessage?: string;
}

const DEFAULT_LOG_FILE = path.join(process.cwd(), "logs", "convex-dev.log");
const DEFAULT_HISTORY = 100;

const LOCAL_HEADER_REGEX =
  /^(\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} (?:AM|PM)) \[CONVEX ([A-Z])\(([^)]+)\)\] (.*)$/;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function parseArgs(args: string[]): Options {
  let cloudOnly = false;
  let localOnly = false;
  let filePath = DEFAULT_LOG_FILE;
  let history = DEFAULT_HISTORY;
  let filter: string | undefined;
  let aggregate = true;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--cloud-only") {
      cloudOnly = true;
    } else if (arg === "--local-only") {
      localOnly = true;
    } else if (arg === "--history" && index + 1 < args.length) {
      history = parseInt(args[++index] ?? String(DEFAULT_HISTORY), 10);
    } else if (arg?.startsWith("--history=")) {
      history = parseInt(arg.slice(10), 10);
    } else if (arg === "--filter" && index + 1 < args.length) {
      filter = args[++index];
    } else if (arg?.startsWith("--filter=")) {
      filter = arg.slice(9);
    } else if (arg === "--file" && index + 1 < args.length) {
      filePath = args[++index] ?? DEFAULT_LOG_FILE;
    } else if (arg?.startsWith("--file=")) {
      filePath = arg.slice(7);
    } else if (arg === "--no-aggregate") {
      aggregate = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  if (cloudOnly && localOnly) {
    console.error("Cannot use both --cloud-only and --local-only.");
    process.exit(1);
  }

  if (!Number.isFinite(history) || history <= 0) {
    console.error("--history must be a positive number.");
    process.exit(1);
  }

  return { cloudOnly, localOnly, filePath, history, filter, aggregate, json };
}

function printUsage(): void {
  console.log(`
Usage:
  bun scripts/convex-log-errors.ts [options]

Options:
  --cloud-only        Show cloud production logs only
  --local-only        Show local dev log only
  --history <n>        Number of log entries to fetch from cloud (default: ${DEFAULT_HISTORY})
  --file <path>        Local log file path (default: ${DEFAULT_LOG_FILE})
  --filter <pattern>   Filter by function name pattern
  --no-aggregate       Show all errors without aggregation
  --json               Output JSON
  --help, -h           Show this help message

Examples:
  bun scripts/convex-log-errors.ts
  bun scripts/convex-log-errors.ts --cloud-only
  bun scripts/convex-log-errors.ts --local-only --file /path/to/convex.log
  bun scripts/convex-log-errors.ts --history 500 --filter listProviderConnections
  bun scripts/convex-log-errors.ts --no-aggregate --json
`);
}

function mapLocalType(letter: string): UdfType {
  switch (letter) {
    case "Q":
      return "Query";
    case "M":
      return "Mutation";
    case "A":
      return "Action";
    case "H":
      return "HttpAction";
    default:
      return "Unknown";
  }
}

function normalizeUdfType(input: string): UdfType {
  switch (input) {
    case "Query":
    case "Mutation":
    case "Action":
    case "HttpAction":
      return input;
    default:
      return "Unknown";
  }
}

function parseLocalTimestamp(timestamp: string): Date | null {
  const match =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i.exec(
      timestamp.trim(),
    );
  if (!match) {
    const fallback = new Date(timestamp);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const meridiem = match[7].toUpperCase();

  if (meridiem === "PM" && hour < 12) {
    hour += 12;
  } else if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractLocation(stackLines: string[]): string | undefined {
  const locations: string[] = [];

  for (const line of stackLines) {
    const trimmed = line.trim();
    const parenMatch = /\(([^)]+):(\d+):(\d+)\)\s*$/.exec(trimmed);
    if (parenMatch) {
      locations.push(`${parenMatch[1]}:${parenMatch[2]}`);
    } else {
      const directMatch = /(\S+):(\d+):(\d+)\s*$/.exec(trimmed);
      if (directMatch) {
        locations.push(`${directMatch[1]}:${directMatch[2]}`);
      }
    }
    if (locations.length >= 2) {
      break;
    }
  }

  if (locations.length === 0) {
    return undefined;
  }

  return locations.length === 1
    ? locations[0]
    : `${locations[0]} -> ${locations[1]}`;
}

function buildFilter(pattern?: string): {
  regex?: RegExp;
  literal?: string;
} {
  if (!pattern) {
    return {};
  }

  try {
    return { regex: new RegExp(pattern, "i") };
  } catch {
    return { literal: pattern.toLowerCase() };
  }
}

function matchesFilter(functionName: string, filter: { regex?: RegExp; literal?: string }): boolean {
  if (!filter.regex && !filter.literal) {
    return true;
  }

  if (filter.regex) {
    return filter.regex.test(functionName);
  }

  if (filter.literal) {
    return functionName.toLowerCase().includes(filter.literal);
  }

  return true;
}

function parseLocalLogFile(filePath: string, limit: number, filter: { regex?: RegExp; literal?: string }): ConvexError[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Local log file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const errors: ConvexError[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    const match = LOCAL_HEADER_REGEX.exec(line);
    if (!match) {
      continue;
    }

    const timestampRaw = match[1];
    const typeLetter = match[2];
    const functionName = match[3];
    const rest = match[4] ?? "";

    const errorMatch = /Uncaught(?: \(in promise\))? Error: (.+)$/.exec(rest);
    if (!errorMatch) {
      continue;
    }

    const errorMessage = errorMatch[1].trim();
    const stackLines: string[] = [];

    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const nextLine = lines[nextIndex];
      if (!nextLine || !/^\s+at /.test(nextLine)) {
        break;
      }
      stackLines.push(nextLine);
      nextIndex += 1;
    }

    index = nextIndex - 1;

    const timestamp = parseLocalTimestamp(timestampRaw);
    if (!timestamp) {
      continue;
    }

    const entry: ConvexError = {
      timestamp,
      type: mapLocalType(typeLetter),
      functionName,
      errorMessage,
      source: "file",
      location: extractLocation(stackLines),
    };

    errors.push(entry);
  }

  const filtered = errors.filter((entry) => matchesFilter(entry.functionName, filter));
  if (limit > 0 && filtered.length > limit) {
    return filtered.slice(-limit);
  }

  return filtered;
}

async function fetchCloudLogs(history: number, filter: { regex?: RegExp; literal?: string }): Promise<ConvexError[]> {
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!deployKey) {
    throw new Error("CONVEX_DEPLOY_KEY environment variable is required for cloud logs.");
  }

  const args = [
    "convex",
    "logs",
    "--jsonl",
    "--history",
    String(history),
    "--prod",
  ];

  const proc = spawn("bunx", args, {
    cwd: path.join(process.cwd(), "packages", "convex"),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey },
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  proc.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const exitCode: number = await new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 0));
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");

  if (exitCode !== 0) {
    const message = stderr.trim() || `convex logs exited with code ${exitCode}`;
    throw new Error(message);
  }

  const errors: ConvexError[] = [];
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().startsWith("{"));

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as ConvexLogEntry;
      if (!entry.error) {
        continue;
      }

      const functionName = entry.identifier ?? "unknown";
      if (!matchesFilter(functionName, filter)) {
        continue;
      }

      const timestamp = new Date(entry.timestamp * 1000);
      errors.push({
        timestamp,
        type: normalizeUdfType(entry.udfType),
        functionName,
        errorMessage: entry.error,
        source: "cloud",
        requestId: entry.requestId,
      });
    } catch {
      continue;
    }
  }

  return errors;
}

function aggregateErrors(errors: ConvexError[], source: SourceType): AggregatedError[] {
  const map = new Map<string, AggregatedError>();

  for (const error of errors) {
    const key = `${error.errorMessage}|||${error.functionName}|||${error.type}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        errorMessage: error.errorMessage,
        functionName: error.functionName,
        type: error.type,
        count: 1,
        firstOccurrence: error.timestamp,
        lastOccurrence: error.timestamp,
        source,
        location: error.location,
      });
      continue;
    }

    existing.count += 1;
    if (error.timestamp < existing.firstOccurrence) {
      existing.firstOccurrence = error.timestamp;
    }
    if (error.timestamp > existing.lastOccurrence) {
      existing.lastOccurrence = error.timestamp;
    }
    if (!existing.location && error.location) {
      existing.location = error.location;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastOccurrence.getTime() - a.lastOccurrence.getTime();
  });
}

function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatRange(first: Date, last: Date): string {
  if (sameDay(first, last)) {
    return `${formatTime(first)} | ${formatTime(last)}`;
  }
  return `${formatDateTime(first)} | ${formatDateTime(last)}`;
}

function formatSingle(date: Date, reference?: Date): string {
  if (reference && sameDay(date, reference)) {
    return formatTime(date);
  }

  const now = new Date();
  if (sameDay(date, now)) {
    return formatTime(date);
  }

  return formatDateTime(date);
}

function formatAggregated(errors: AggregatedError[], source: SourceType): string[] {
  if (errors.length === 0) {
    return ["No errors found."];
  }

  const lines: string[] = [];
  for (const error of errors) {
    const occurrenceLabel = error.count === 1 ? "occurrence" : "occurrences";
    lines.push(`[${error.count} ${occurrenceLabel}] ${error.errorMessage}`);
    lines.push(`  Function: ${error.functionName} (${error.type})`);
    if (error.count === 1) {
      lines.push(`  Time: ${formatSingle(error.firstOccurrence)}`);
    } else {
      const range = formatRange(error.firstOccurrence, error.lastOccurrence);
      const [first, last] = range.split(" | ");
      if (last) {
        lines.push(`  First: ${first} | Last: ${last}`);
      } else {
        lines.push(`  First: ${range}`);
      }
    }

    if (source === "file" && error.location) {
      lines.push(`  Location: ${error.location}`);
    }

    lines.push("");
  }

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function formatUnaggregated(errors: ConvexError[], source: SourceType): string[] {
  if (errors.length === 0) {
    return ["No errors found."];
  }

  const sorted = [...errors].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const lines: string[] = [];

  for (const error of sorted) {
    lines.push(`[${formatDateTime(error.timestamp)}] ${error.errorMessage}`);
    lines.push(`  Function: ${error.functionName} (${error.type})`);
    if (source === "file" && error.location) {
      lines.push(`  Location: ${error.location}`);
    }
    if (source === "cloud" && error.requestId) {
      lines.push(`  Request: ${error.requestId}`);
    }
    lines.push("");
  }

  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function formatOutput(
  results: SourceResult[],
  options: Options,
  includeCloud: boolean,
  includeLocal: boolean,
): string {
  const lines: string[] = [];
  lines.push("Convex Errors Summary");
  lines.push("=====================");

  for (const result of results) {
    lines.push("");
    lines.push(`=== ${result.label} ===`);
    lines.push("");

    if (result.errorMessage) {
      lines.push(`Failed to load ${result.label.toLowerCase()}: ${result.errorMessage}`);
    } else if (options.aggregate) {
      lines.push(...formatAggregated(result.aggregated, result.source));
    } else {
      lines.push(...formatUnaggregated(result.errors, result.source));
    }

    const subtotalErrors = result.errors.length;
    const subtotalUnique = result.aggregated.length;
    lines.push("");
    if (options.aggregate) {
      lines.push(`Subtotal: ${subtotalErrors} errors (${subtotalUnique} unique)`);
    } else {
      lines.push(`Subtotal: ${subtotalErrors} errors`);
    }
  }

  const totalErrors = results.reduce((sum, result) => sum + result.errors.length, 0);
  const totalUnique = results.reduce(
    (sum, result) => sum + result.aggregated.length,
    0,
  );
  const sourceCount = (includeCloud ? 1 : 0) + (includeLocal ? 1 : 0);

  lines.push("");
  lines.push("=== Summary ===");
  if (options.aggregate) {
    lines.push(`Total: ${totalErrors} errors across ${sourceCount} sources (${totalUnique} unique)`);
  } else {
    lines.push(`Total: ${totalErrors} errors across ${sourceCount} sources`);
  }

  return lines.join("\n");
}

function serializeErrors(errors: ConvexError[]): Array<Record<string, unknown>> {
  return errors.map((error) => ({
    timestamp: error.timestamp.toISOString(),
    type: error.type,
    functionName: error.functionName,
    errorMessage: error.errorMessage,
    source: error.source,
    location: error.location,
    requestId: error.requestId,
  }));
}

function serializeAggregated(errors: AggregatedError[]): Array<Record<string, unknown>> {
  return errors.map((error) => ({
    errorMessage: error.errorMessage,
    functionName: error.functionName,
    type: error.type,
    count: error.count,
    firstOccurrence: error.firstOccurrence.toISOString(),
    lastOccurrence: error.lastOccurrence.toISOString(),
    source: error.source,
    location: error.location,
  }));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const includeCloud = !options.localOnly;
  const includeLocal = !options.cloudOnly;
  const filter = buildFilter(options.filter);

  const results: SourceResult[] = [];
  let hadError = false;

  if (includeCloud) {
    try {
      const cloudErrors = await fetchCloudLogs(options.history, filter);
      const aggregated = aggregateErrors(cloudErrors, "cloud");
      results.push({
        label: "Cloud Production",
        source: "cloud",
        errors: cloudErrors,
        aggregated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        label: "Cloud Production",
        source: "cloud",
        errors: [],
        aggregated: [],
        errorMessage: message,
      });
      hadError = true;
    }
  }

  if (includeLocal) {
    try {
      const localErrors = parseLocalLogFile(options.filePath, options.history, filter);
      const aggregated = aggregateErrors(localErrors, "file");
      results.push({
        label: "Local Dev Log",
        source: "file",
        errors: localErrors,
        aggregated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        label: "Local Dev Log",
        source: "file",
        errors: [],
        aggregated: [],
        errorMessage: message,
      });
      hadError = true;
    }
  }

  if (options.json) {
    const jsonOutput = {
      generatedAt: new Date().toISOString(),
      options,
      sources: results.map((result) => ({
        label: result.label,
        source: result.source,
        errorMessage: result.errorMessage,
        subtotal: {
          errors: result.errors.length,
          unique: result.aggregated.length,
        },
        errors: serializeErrors(result.errors),
        aggregated: serializeAggregated(result.aggregated),
      })),
      summary: {
        totalErrors: results.reduce((sum, result) => sum + result.errors.length, 0),
        totalUnique: results.reduce((sum, result) => sum + result.aggregated.length, 0),
        sources: (includeCloud ? 1 : 0) + (includeLocal ? 1 : 0),
      },
    };

    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    console.log(formatOutput(results, options, includeCloud, includeLocal));
  }

  if (hadError) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
