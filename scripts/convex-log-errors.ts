#!/usr/bin/env bun
/**
 * Convex Log Error Detection Script
 *
 * Parses logs/convex-dev.log for Convex errors and aggregates them.
 *
 * Usage:
 *   bun scripts/convex-log-errors.ts
 *   bun scripts/convex-log-errors.ts --since 10m
 *   bun scripts/convex-log-errors.ts --json
 *   bun scripts/convex-log-errors.ts --filter "listProviderConnections"
 *   bun scripts/convex-log-errors.ts --no-aggregate
 */

import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_LOG_PATH = "logs/convex-dev.log";

const HEADER_RE =
  /^(\d{1,2}\/\d{1,2}\/\d{4},\s+\d{1,2}:\d{2}:\d{2}\s+(?:AM|PM))\s+\[CONVEX\s+([QMAH])\(([^)]+)\)\]\s+(.+)$/;
const STACK_RE = /^\s+at\s+/;

const TYPE_LABELS: Record<ConvexError["type"], string> = {
  Q: "Query",
  M: "Mutation",
  A: "Action",
  H: "HTTP",
};

interface ConvexError {
  timestamp: Date;
  type: "Q" | "M" | "A" | "H";
  functionName: string;
  errorMessage: string;
  stackTrace: string[];
}

interface AggregatedError {
  errorMessage: string;
  functionName: string;
  type: ConvexError["type"];
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  stackTrace: string[];
}

interface Options {
  sinceMs?: number;
  json: boolean;
  filterPattern?: RegExp;
  filterRaw?: string;
  aggregate: boolean;
  logPath: string;
}

function parseArgs(argv: string[]): Options {
  let sinceMs: number | undefined;
  let json = false;
  let aggregate = true;
  let filterRaw: string | undefined;
  let logPath = resolveLogPath();

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--since") {
      const value = argv[++i] ?? "";
      const parsed = parseDurationToMs(value);
      if (parsed == null) {
        console.error(`Invalid --since duration: ${value}`);
        printUsage();
        process.exit(1);
      }
      sinceMs = parsed;
    } else if (arg.startsWith("--since=")) {
      const value = arg.slice("--since=".length);
      const parsed = parseDurationToMs(value);
      if (parsed == null) {
        console.error(`Invalid --since duration: ${value}`);
        printUsage();
        process.exit(1);
      }
      sinceMs = parsed;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--filter") {
      filterRaw = argv[++i];
    } else if (arg.startsWith("--filter=")) {
      filterRaw = arg.slice("--filter=".length);
    } else if (arg === "--no-aggregate") {
      aggregate = false;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--log") {
      logPath = argv[++i] ?? logPath;
    } else if (arg.startsWith("--log=")) {
      logPath = arg.slice("--log=".length) || logPath;
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  let filterPattern: RegExp | undefined;
  if (filterRaw) {
    try {
      filterPattern = new RegExp(filterRaw, "i");
    } catch (error) {
      console.error(`Invalid --filter pattern: ${filterRaw}`);
      if (error instanceof Error && error.message) {
        console.error(error.message);
      }
      process.exit(1);
    }
  }

  return { sinceMs, json, filterPattern, filterRaw, aggregate, logPath };
}

function printUsage(): void {
  console.log(`
Usage: bun scripts/convex-log-errors.ts [options]

Parses Convex dev logs for errors and summarizes them.
Default log path: ${DEFAULT_LOG_PATH}

Options:
  --since <duration>    Only include errors within the last duration (e.g. 10m, 2h, 1d)
  --filter <pattern>    RegExp pattern to match function names
  --json                Output JSON instead of human-readable
  --no-aggregate        List each error instead of grouping
  --log <path>          Override log path (default: ${DEFAULT_LOG_PATH})
  --help, -h            Show this help message
`);
}

function resolveLogPath(): string {
  const candidates: string[] = [];
  candidates.push(path.join(process.cwd(), DEFAULT_LOG_PATH));
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  if (repoRoot !== process.cwd()) {
    candidates.push(path.join(repoRoot, DEFAULT_LOG_PATH));
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function parseDurationToMs(input: string): number | null {
  const match = /^\s*(\d+)\s*([smhd])\s*$/i.exec(input);
  if (!match) return null;
  const value = parseInt(match[1] ?? "", 10);
  const unit = (match[2] ?? "").toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  const multiplier = multipliers[unit];
  if (!multiplier) return null;
  return value * multiplier;
}

function parseTimestamp(raw: string): Date {
  const match =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i.exec(
      raw.trim(),
    );
  if (match) {
    const month = parseInt(match[1] ?? "1", 10);
    const day = parseInt(match[2] ?? "1", 10);
    const year = parseInt(match[3] ?? "1970", 10);
    let hour = parseInt(match[4] ?? "0", 10);
    const minute = parseInt(match[5] ?? "0", 10);
    const second = parseInt(match[6] ?? "0", 10);
    const meridiem = (match[7] ?? "AM").toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return new Date(year, month - 1, day, hour, minute, second);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isErrorMessage(message: string): boolean {
  return /error|exception|unhandled/i.test(message);
}

function normalizeMessage(message: string): string {
  const trimmed = message.trim();
  const prefixes: RegExp[] = [
    /^uncaught\s+error:\s*/i,
    /^unhandled\s+error:\s*/i,
    /^uncaught\s+exception:\s*/i,
    /^exception:\s*/i,
    /^error:\s*/i,
  ];
  for (const prefix of prefixes) {
    if (prefix.test(trimmed)) {
      const normalized = trimmed.replace(prefix, "").trim();
      return normalized || trimmed;
    }
  }
  return trimmed;
}

function parseLogFile(logPath: string): ConvexError[] {
  if (!fs.existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    console.error("Run scripts/dev.sh to generate logs, or pass --log <path>.");
    process.exit(1);
  }
  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.split(/\r?\n/);
  const errors: ConvexError[] = [];
  let current: ConvexError | null = null;

  for (const line of lines) {
    const match = HEADER_RE.exec(line);
    if (match) {
      if (current) {
        errors.push(current);
        current = null;
      }
      const tsRaw = match[1] ?? "";
      const type = match[2] as ConvexError["type"];
      const functionName = match[3] ?? "unknown";
      const message = match[4] ?? "";
      if (!isErrorMessage(message)) {
        continue;
      }
      current = {
        timestamp: parseTimestamp(tsRaw),
        type,
        functionName,
        errorMessage: normalizeMessage(message),
        stackTrace: [],
      };
      continue;
    }

    if (current && STACK_RE.test(line)) {
      current.stackTrace.push(line.trim());
    }
  }

  if (current) errors.push(current);
  return errors;
}

function aggregateErrors(errors: ConvexError[]): AggregatedError[] {
  const map = new Map<string, AggregatedError>();

  for (const error of errors) {
    const key = `${error.type}|${error.functionName}|${error.errorMessage}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (error.timestamp < existing.firstOccurrence) {
        existing.firstOccurrence = error.timestamp;
      }
      if (error.timestamp > existing.lastOccurrence) {
        existing.lastOccurrence = error.timestamp;
        existing.stackTrace = error.stackTrace;
      }
    } else {
      map.set(key, {
        errorMessage: error.errorMessage,
        functionName: error.functionName,
        type: error.type,
        count: 1,
        firstOccurrence: error.timestamp,
        lastOccurrence: error.timestamp,
        stackTrace: error.stackTrace,
      });
    }
  }

  const aggregated = Array.from(map.values());
  aggregated.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastOccurrence.getTime() - a.lastOccurrence.getTime();
  });
  return aggregated;
}

function applyFilters(errors: ConvexError[], options: Options): ConvexError[] {
  let filtered = errors;
  if (options.sinceMs != null) {
    const cutoff = Date.now() - options.sinceMs;
    filtered = filtered.filter((error) => error.timestamp.getTime() >= cutoff);
  }
  if (options.filterPattern) {
    filtered = filtered.filter((error) =>
      options.filterPattern?.test(error.functionName),
    );
  }
  return filtered;
}

function extractLocation(stackTrace: string[]): string | null {
  const locations: string[] = [];

  for (const line of stackTrace) {
    const filePart = extractFilePart(line);
    if (!filePart) continue;
    if (filePart.includes("node_modules") || filePart.startsWith("node:")) {
      continue;
    }
    const location = formatLocation(filePart);
    if (!location) continue;
    if (!locations.includes(location)) {
      locations.push(location);
    }
    if (locations.length >= 2) break;
  }

  if (locations.length === 0) return null;
  return locations.join(" -> ");
}

function extractFilePart(line: string): string | null {
  const parenMatch = /\(([^)]+)\)\s*$/.exec(line);
  if (parenMatch) return parenMatch[1] ?? null;
  const directMatch = /^\s*at\s+(.+)$/.exec(line);
  if (directMatch) return directMatch[1] ?? null;
  return null;
}

function formatLocation(raw: string): string | null {
  let input = raw.trim();
  if (!input) return null;

  if (input.startsWith("file://")) {
    try {
      input = fileURLToPath(input);
    } catch {
      // Keep original if parsing fails.
    }
  }

  input = input.replace(/\\/g, "/");

  const match = /^(.*):(\d+):(\d+)$/.exec(input);
  if (match) {
    const filePath = shortenPath(match[1] ?? "");
    const line = match[2] ?? "";
    if (!filePath) return null;
    return `${filePath}:${line}`;
  }

  const matchNoColumn = /^(.*):(\d+)$/.exec(input);
  if (matchNoColumn) {
    const filePath = shortenPath(matchNoColumn[1] ?? "");
    const line = matchNoColumn[2] ?? "";
    if (!filePath) return null;
    return `${filePath}:${line}`;
  }

  return shortenPath(input) || null;
}

function shortenPath(raw: string): string {
  let output = raw.replace(/\\/g, "/");
  output = output.replace(/^\.\//, "");
  output = output.replace(/^(\.\.\/)+/, "");

  if (path.isAbsolute(output)) {
    const relative = path.relative(process.cwd(), output);
    if (!relative.startsWith("..")) {
      output = relative;
    }
  }

  output = output.replace(/^packages\/convex\//, "");
  output = output.replace(/^packages\/convex\/\.\./, "");
  return output;
}

function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const meridiem = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hours}:${mm}:${ss} ${meridiem}`;
}

function formatTimestamp(date: Date, includeDate: boolean): string {
  if (includeDate) {
    return `${formatDate(date)}, ${formatTime(date)}`;
  }
  return formatTime(date);
}

function shouldIncludeDate(errors: ConvexError[]): boolean {
  if (errors.length === 0) return false;
  let min = errors[0]?.timestamp;
  let max = errors[0]?.timestamp;
  if (!min || !max) return false;
  for (const error of errors) {
    if (error.timestamp < min) min = error.timestamp;
    if (error.timestamp > max) max = error.timestamp;
  }
  return (
    min.getFullYear() !== max.getFullYear() ||
    min.getMonth() !== max.getMonth() ||
    min.getDate() !== max.getDate()
  );
}

function formatAggregatedOutput(
  errors: ConvexError[],
  aggregated: AggregatedError[],
  includeDate: boolean,
): string {
  const lines: string[] = [];
  lines.push("Convex Errors Summary");
  lines.push("=====================");
  lines.push("");

  if (aggregated.length === 0) {
    lines.push("No errors found.");
    return lines.join("\n");
  }

  for (const entry of aggregated) {
    const occurrenceLabel = entry.count === 1 ? "occurrence" : "occurrences";
    lines.push(`[${entry.count} ${occurrenceLabel}] ${entry.errorMessage}`);
    lines.push(
      `  Function: ${entry.functionName} (${TYPE_LABELS[entry.type] ?? entry.type})`,
    );
    const location = extractLocation(entry.stackTrace);
    if (location) {
      lines.push(`  Location: ${location}`);
    }

    if (entry.count === 1) {
      lines.push(`  Time: ${formatTimestamp(entry.firstOccurrence, includeDate)}`);
    } else {
      const first = formatTimestamp(entry.firstOccurrence, includeDate);
      const last = formatTimestamp(entry.lastOccurrence, includeDate);
      lines.push(`  First: ${first} | Last: ${last}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${errors.length} errors (${aggregated.length} unique)`);
  return lines.join("\n");
}

function formatRawOutput(errors: ConvexError[], includeDate: boolean): string {
  const lines: string[] = [];
  lines.push("Convex Errors");
  lines.push("=============");
  lines.push("");

  if (errors.length === 0) {
    lines.push("No errors found.");
    return lines.join("\n");
  }

  for (const [index, error] of errors.entries()) {
    const header = `${formatTimestamp(error.timestamp, includeDate)}  ${error.functionName} (${TYPE_LABELS[error.type] ?? error.type})`;
    lines.push(`${index + 1}. ${header}`);
    lines.push(`   ${error.errorMessage}`);
    if (error.stackTrace.length > 0) {
      for (const frame of error.stackTrace) {
        lines.push(`   ${frame}`);
      }
    }
    lines.push("");
  }

  lines.push(`Total: ${errors.length} errors`);
  return lines.join("\n");
}

function formatJsonOutput(
  errors: ConvexError[],
  aggregated: AggregatedError[] | null,
  options: Options,
): string {
  const base = {
    logPath: options.logPath,
    total: errors.length,
    filteredSinceMs: options.sinceMs ?? null,
    filter: options.filterRaw ?? null,
  };

  if (aggregated) {
    return JSON.stringify(
      {
        ...base,
        unique: aggregated.length,
        aggregated: true,
        errors: aggregated.map((entry) => ({
          errorMessage: entry.errorMessage,
          functionName: entry.functionName,
          type: entry.type,
          count: entry.count,
          firstOccurrence: entry.firstOccurrence.toISOString(),
          lastOccurrence: entry.lastOccurrence.toISOString(),
          stackTrace: entry.stackTrace,
        })),
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      ...base,
      aggregated: false,
      errors: errors.map((entry) => ({
        timestamp: entry.timestamp.toISOString(),
        type: entry.type,
        functionName: entry.functionName,
        errorMessage: entry.errorMessage,
        stackTrace: entry.stackTrace,
      })),
    },
    null,
    2,
  );
}

function main(): void {
  const options = parseArgs(process.argv);
  const parsedErrors = parseLogFile(options.logPath);
  const filteredErrors = applyFilters(parsedErrors, options);
  const includeDate = shouldIncludeDate(filteredErrors);

  if (options.aggregate) {
    const aggregated = aggregateErrors(filteredErrors);
    if (options.json) {
      console.log(formatJsonOutput(filteredErrors, aggregated, options));
      return;
    }
    console.log(formatAggregatedOutput(filteredErrors, aggregated, includeDate));
    return;
  }

  if (options.json) {
    console.log(formatJsonOutput(filteredErrors, null, options));
    return;
  }

  console.log(formatRawOutput(filteredErrors, includeDate));
}

main();
