#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type ConvexErrorType = "Q" | "M" | "A" | "H";

interface ConvexError {
  timestamp: Date;
  type: ConvexErrorType;
  functionName: string;
  errorMessage: string;
  stackTrace: string[];
  rawLine: string;
}

interface AggregatedError {
  errorMessage: string;
  functionName: string;
  type: ConvexErrorType;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  stackTrace: string[];
}

interface Options {
  sinceMinutes: number | null;
  json: boolean;
  filter: string | null;
  aggregate: boolean;
  logPath: string;
}

const TYPE_LABELS: Record<ConvexErrorType, string> = {
  Q: "Query",
  M: "Mutation",
  A: "Action",
  H: "HTTP",
};

function parseTimestamp(timestampStr: string): Date | null {
  // Format: M/D/YYYY, H:MM:SS AM/PM
  const match = timestampStr.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i
  );
  if (!match) return null;

  const [, month, day, year, hour, minute, second, ampm] = match;
  let hours = parseInt(hour!, 10);
  if (ampm!.toUpperCase() === "PM" && hours !== 12) {
    hours += 12;
  } else if (ampm!.toUpperCase() === "AM" && hours === 12) {
    hours = 0;
  }

  return new Date(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10),
    hours,
    parseInt(minute!, 10),
    parseInt(second!, 10)
  );
}

function parseLogFile(logPath: string): ConvexError[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf8");
  const lines = content.split("\n");
  const errors: ConvexError[] = [];

  // Pattern: timestamp [CONVEX X(function:name)] Uncaught Error: message
  const errorPattern =
    /^(.+?)\s+\[CONVEX\s+([QMAH])\(([^)]+)\)\]\s+Uncaught Error:\s+(.+)$/;
  const stackPattern = /^\s+at\s+/;

  let currentError: ConvexError | null = null;

  for (const line of lines) {
    const errorMatch = line.match(errorPattern);
    if (errorMatch) {
      // Save previous error if exists
      if (currentError) {
        errors.push(currentError);
      }

      const [, timestampStr, type, functionName, errorMessage] = errorMatch;
      const timestamp = parseTimestamp(timestampStr!);

      if (timestamp) {
        currentError = {
          timestamp,
          type: type as ConvexErrorType,
          functionName: functionName!,
          errorMessage: errorMessage!,
          stackTrace: [],
          rawLine: line,
        };
      } else {
        currentError = null;
      }
    } else if (currentError && stackPattern.test(line)) {
      currentError.stackTrace.push(line.trim());
    } else if (currentError && line.trim() === "") {
      // End of stack trace
      errors.push(currentError);
      currentError = null;
    }
  }

  // Don't forget the last error
  if (currentError) {
    errors.push(currentError);
  }

  return errors;
}

function aggregateErrors(errors: ConvexError[]): AggregatedError[] {
  const groups = new Map<string, AggregatedError>();

  for (const error of errors) {
    // Group by error message + function name
    const key = `${error.functionName}|${error.errorMessage}`;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (error.timestamp < existing.firstOccurrence) {
        existing.firstOccurrence = error.timestamp;
      }
      if (error.timestamp > existing.lastOccurrence) {
        existing.lastOccurrence = error.timestamp;
      }
    } else {
      groups.set(key, {
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

  // Sort by count descending, then by last occurrence descending
  return [...groups.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastOccurrence.getTime() - a.lastOccurrence.getTime();
  });
}

function filterErrors(errors: ConvexError[], pattern: string): ConvexError[] {
  const lowerPattern = pattern.toLowerCase();
  return errors.filter(
    (e) =>
      e.functionName.toLowerCase().includes(lowerPattern) ||
      e.errorMessage.toLowerCase().includes(lowerPattern)
  );
}

function filterByTime(errors: ConvexError[], sinceMinutes: number): ConvexError[] {
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000);
  return errors.filter((e) => e.timestamp >= cutoff);
}

function extractLocation(stackTrace: string[]): string {
  if (stackTrace.length === 0) return "";

  // Extract meaningful locations from stack trace
  const locations: string[] = [];
  for (const line of stackTrace.slice(0, 2)) {
    // Parse: at functionName (file:line:col)
    const match = line.match(/at\s+(?:async\s+)?(\w+)\s+\(([^)]+)\)/);
    if (match) {
      const [, , location] = match;
      // Clean up the path
      const cleanLoc = location!
        .replace(/^\.\.\/+/, "")
        .replace(/:\d+$/, ""); // Remove column
      locations.push(cleanLoc);
    }
  }

  return locations.join(" -> ");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatOutput(aggregated: AggregatedError[], options: Options): string {
  if (options.json) {
    return JSON.stringify(aggregated, null, 2);
  }

  if (aggregated.length === 0) {
    return "No Convex errors found.";
  }

  const lines: string[] = [];
  lines.push("Convex Errors Summary");
  lines.push("=====================");
  lines.push("");

  for (const error of aggregated) {
    const countLabel =
      error.count === 1
        ? "[1 occurrence]"
        : `[${error.count} occurrences]`;

    lines.push(`${countLabel} ${error.errorMessage}`);
    lines.push(
      `  Function: ${error.functionName} (${TYPE_LABELS[error.type]})`
    );

    const location = extractLocation(error.stackTrace);
    if (location) {
      lines.push(`  Location: ${location}`);
    }

    if (error.count === 1) {
      lines.push(`  Time: ${formatTime(error.lastOccurrence)}`);
    } else {
      lines.push(
        `  First: ${formatTime(error.firstOccurrence)} | Last: ${formatTime(error.lastOccurrence)}`
      );
    }
    lines.push("");
  }

  const totalErrors = aggregated.reduce((sum, e) => sum + e.count, 0);
  lines.push(`Total: ${totalErrors} errors (${aggregated.length} unique)`);

  return lines.join("\n");
}

function formatRawOutput(errors: ConvexError[], options: Options): string {
  if (options.json) {
    return JSON.stringify(errors, null, 2);
  }

  if (errors.length === 0) {
    return "No Convex errors found.";
  }

  const lines: string[] = [];
  lines.push("Convex Errors (chronological)");
  lines.push("=============================");
  lines.push("");

  // Sort by timestamp descending (most recent first)
  const sorted = [...errors].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  for (const error of sorted) {
    lines.push(`[${formatTime(error.timestamp)}] ${error.errorMessage}`);
    lines.push(
      `  Function: ${error.functionName} (${TYPE_LABELS[error.type]})`
    );

    const location = extractLocation(error.stackTrace);
    if (location) {
      lines.push(`  Location: ${location}`);
    }
    lines.push("");
  }

  lines.push(`Total: ${errors.length} errors`);

  return lines.join("\n");
}

function parseDuration(value: string): number | null {
  const match = value.match(/^(\d+)(m|h|s)?$/);
  if (!match) return null;

  const num = parseInt(match[1]!, 10);
  const unit = match[2] ?? "m";

  switch (unit) {
    case "s":
      return num / 60;
    case "m":
      return num;
    case "h":
      return num * 60;
    default:
      return null;
  }
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    sinceMinutes: null,
    json: false,
    filter: null,
    aggregate: true,
    logPath: path.join(process.cwd(), "logs", "convex-dev.log"),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-aggregate") {
      options.aggregate = false;
    } else if (arg === "--since" && args[i + 1]) {
      const duration = parseDuration(args[i + 1]!);
      if (duration !== null) {
        options.sinceMinutes = duration;
      } else {
        console.error(`Invalid duration: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    } else if (arg === "--filter" && args[i + 1]) {
      options.filter = args[i + 1]!;
      i++;
    } else if (arg === "--log" && args[i + 1]) {
      options.logPath = args[i + 1]!;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun scripts/convex-log-errors.ts [options]

Options:
  --since <duration>   Show errors from last N minutes/hours (e.g., 10m, 1h, 30s)
  --json               Output as JSON
  --filter <pattern>   Filter by function name or error message
  --no-aggregate       Show all errors without aggregation
  --log <path>         Path to convex-dev.log (default: logs/convex-dev.log)
  --help, -h           Show this help message

Examples:
  bun scripts/convex-log-errors.ts
  bun scripts/convex-log-errors.ts --since 10m
  bun scripts/convex-log-errors.ts --json
  bun scripts/convex-log-errors.ts --filter "listProviderConnections"
  bun scripts/convex-log-errors.ts --no-aggregate
`);
      process.exit(0);
    }
  }

  return options;
}

function main(): void {
  const options = parseArgs();

  if (!fs.existsSync(options.logPath)) {
    console.log(`Log file not found: ${options.logPath}`);
    console.log("Run ./scripts/dev.sh to generate Convex logs.");
    process.exit(0);
  }

  let errors = parseLogFile(options.logPath);

  if (options.sinceMinutes !== null) {
    errors = filterByTime(errors, options.sinceMinutes);
  }

  if (options.filter !== null) {
    errors = filterErrors(errors, options.filter);
  }

  let output: string;
  if (options.aggregate) {
    const aggregated = aggregateErrors(errors);
    output = formatOutput(aggregated, options);
  } else {
    output = formatRawOutput(errors, options);
  }

  console.log(output);
}

main();
