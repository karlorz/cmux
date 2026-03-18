# @cmux/pr-heatmap

AI-powered code review heatmap generator for PR diffs.

Analyzes git diffs and scores each changed line by review priority using OpenAI, helping reviewers focus on high-risk changes (potential bugs, security issues, breaking changes).

## Installation

```bash
# From workspace root
bun install
```

## Usage

### CLI

```bash
# Requires OPENAI_API_KEY environment variable
export OPENAI_API_KEY=your-key

# Generate heatmap for changes against origin/main
bunx pr-heatmap

# Analyze a specific GitHub PR (requires gh CLI)
bunx pr-heatmap 123
bunx pr-heatmap -p 456

# Custom base branch
bunx pr-heatmap -b main

# Verbose output with GPT-4o
bunx pr-heatmap -v -m gpt-4o

# Custom output directory
bunx pr-heatmap -o ./review-output
```

### Via devsh

```bash
devsh review                    # Review changes against origin/main
devsh review 123                # Review PR #123 via gh CLI
devsh review -b main -v         # Custom base, verbose
devsh review -m gpt-4o          # Use GPT-4o model
devsh review --json             # JSON output for scripting
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --pr <number>` | GitHub PR number (requires gh CLI) | - |
| `-b, --base <ref>` | Base ref to diff against | `origin/main` |
| `-c, --concurrency <n>` | Parallel AI calls | `3` |
| `-m, --model <model>` | OpenAI model | `gpt-4o-mini` |
| `-v, --verbose` | Show progress | `false` |
| `-o, --output <dir>` | Output directory | `./heatmap-output` |

## Output

The heatmap output includes:

- **Per-line scores** (0-10): Review priority for each changed line
- **Explanations**: Why high-priority lines need attention
- **File-level risk scores**: Overall risk assessment per file
- **Summary**: Top focus areas and high-risk files

Output files are written to the output directory:
- `summary.json` - Overall heatmap result
- `<filename>.heatmap.json` - Per-file detailed heatmaps

## API

```typescript
import { generatePRHeatmap } from "@cmux/pr-heatmap";

const result = await generatePRHeatmap({
  base: "origin/main",
  concurrency: 3,
  model: "gpt-4o-mini",
  verbose: true,
});

console.log(result.summary.highRiskFiles);
```

## Development

```bash
cd packages/pr-heatmap
bun test           # Run tests
bun run typecheck  # Type check
bun run build      # Build CLI binary
```
