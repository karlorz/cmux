#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { generatePRHeatmap } from "./heatmap-generator.js";
import type { HeatmapOptions, PRHeatmapResult } from "./types.js";

function parseArgs(): HeatmapOptions & { help: boolean } {
  const args = process.argv.slice(2);
  const options: HeatmapOptions & { help: boolean } = {
    base: "origin/main",
    concurrency: 3,
    model: "gpt-4o-mini",
    verbose: false,
    outputDir: "./heatmap-output",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-b":
      case "--base":
        options.base = args[++i];
        break;
      case "-c":
      case "--concurrency":
        options.concurrency = parseInt(args[++i], 10);
        break;
      case "-m":
      case "--model":
        options.model = args[++i];
        break;
      case "-v":
      case "--verbose":
        options.verbose = true;
        break;
      case "-o":
      case "--output":
        options.outputDir = args[++i];
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
pr-heatmap - Generate AI-powered code review heatmaps for PR diffs

Usage: pr-heatmap [options]

Options:
  -h, --help              Show this help message
  -b, --base <ref>        Base ref to diff against (default: origin/main)
  -c, --concurrency <n>   Number of parallel AI calls (default: 3)
  -m, --model <model>     OpenAI model to use (default: gpt-4o-mini)
  -v, --verbose           Show progress messages
  -o, --output <dir>      Output directory (default: ./heatmap-output)

Environment:
  OPENAI_API_KEY          Required. Your OpenAI API key.

Examples:
  pr-heatmap                          # Diff against origin/main
  pr-heatmap -b main -v               # Diff against local main, verbose
  pr-heatmap -m gpt-4o -c 5           # Use GPT-4o with 5 concurrent calls
`);
}

function printSummary(result: PRHeatmapResult): void {
  console.log("\n=== PR Heatmap Summary ===\n");
  console.log(`Base: ${result.base}`);
  console.log(`Head: ${result.head}`);
  console.log(`Files analyzed: ${result.summary.totalFiles}`);

  if (result.summary.highRiskFiles.length > 0) {
    console.log(`\nHigh-risk files (score >= 7):`);
    for (const file of result.summary.highRiskFiles) {
      const fileResult = result.files.find((f) => f.path === file);
      console.log(`  - ${file} (risk: ${fileResult?.heatmap.overallRiskScore}/10)`);
    }
  } else {
    console.log(`\nNo high-risk files detected.`);
  }

  if (result.summary.topFocusAreas.length > 0) {
    console.log(`\nTop focus areas:`);
    for (const area of result.summary.topFocusAreas) {
      console.log(`  - ${area}`);
    }
  }

  console.log("\nPer-file summaries:");
  for (const file of result.files) {
    const risk = file.heatmap.overallRiskScore;
    const riskIndicator =
      risk >= 7 ? "[HIGH]" : risk >= 4 ? "[MED]" : "[LOW]";
    console.log(`\n${riskIndicator} ${file.path} (${file.status})`);
    console.log(`  ${file.heatmap.fileSummary}`);
  }
}

function writeOutput(result: PRHeatmapResult, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  // Write combined summary
  const summaryPath = join(outputDir, "summary.json");
  writeFileSync(summaryPath, JSON.stringify(result, null, 2));
  console.log(`\nWrote summary to: ${summaryPath}`);

  // Write per-file heatmaps
  for (const file of result.files) {
    const safeName = file.path.replace(/\//g, "__");
    const filePath = join(outputDir, `${safeName}.json`);
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          path: file.path,
          status: file.status,
          heatmap: file.heatmap,
        },
        null,
        2
      )
    );
  }
  console.log(`Wrote ${result.files.length} file heatmaps to: ${outputDir}/`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  try {
    const result = await generatePRHeatmap(options);

    printSummary(result);
    writeOutput(result, options.outputDir ?? "./heatmap-output");

    // Exit with code based on risk
    const hasHighRisk = result.summary.highRiskFiles.length > 0;
    process.exit(hasHighRisk ? 1 : 0);
  } catch (error) {
    console.error("Error generating heatmap:", error);
    process.exit(2);
  }
}

main();
