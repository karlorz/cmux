#!/usr/bin/env bun

import {
  applyPackageOverrides,
  parsePackageOverrides,
  readIdeDeps,
  writeIdeDeps,
} from "./lib/ideDeps";

function parseArgs(argv: string[]): { rawOverrides?: string } {
  let rawOverrides: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json" && index + 1 < argv.length) {
      rawOverrides = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--json=")) {
      const [, value] = arg.split("=", 2);
      rawOverrides = value;
    }
  }

  return { rawOverrides };
}

async function main(): Promise<void> {
  const { rawOverrides } = parseArgs(process.argv.slice(2));
  const overridesInput =
    rawOverrides ?? process.env.IDE_DEPS_PACKAGE_OVERRIDES ?? "";
  const trimmedOverrides = overridesInput.trim();

  if (trimmedOverrides.length === 0) {
    console.log(
      "[apply-ide-deps-package-overrides] No IDE_DEPS_PACKAGE_OVERRIDES provided; skipping.",
    );
    return;
  }

  const overrides = parsePackageOverrides(trimmedOverrides);
  const deps = await readIdeDeps(process.cwd());
  const changed = applyPackageOverrides(deps, overrides);

  if (!changed) {
    console.log(
      `[apply-ide-deps-package-overrides] No package changes needed (${Object.keys(overrides).join(", ")}).`,
    );
    return;
  }

  await writeIdeDeps(process.cwd(), deps);
  console.log(
    `[apply-ide-deps-package-overrides] Applied overrides for ${Object.keys(overrides).join(", ")}.`,
  );
}

await main();
