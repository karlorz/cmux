// Playwright helper to send Sentry test errors for both deployments.
// Prereqs: build the Electron entry (bun run build:electron) and have a web
// dev server running at CMUX_WEB_URL (defaults to http://localhost:5173).
// Run: bunx playwright install chromium && bunx tsx scripts/trigger-sentry.playwright.ts
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, _electron as electron } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = join(__dirname, "..");
const defaultWebUrl = process.env.CMUX_WEB_URL ?? "http://localhost:5173";
const electronEntry =
  process.env.CMUX_ELECTRON_ENTRY ?? join(clientDir, "out", "main", "index.js");

async function triggerWebErrors() {
  console.log("[sentry] triggering web error via", defaultWebUrl);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(defaultWebUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof (window as typeof window & { __cmuxTriggerSentryError?: () => void }).__cmuxTriggerSentryError === "function",
      undefined,
      { timeout: 15_000 }
    );
    await page.evaluate(() => {
      (window as typeof window & { __cmuxTriggerSentryError?: () => void }).__cmuxTriggerSentryError?.();
    });
    await page.waitForTimeout(2_000);
  } finally {
    await browser.close();
  }
}

async function triggerElectronErrors() {
  if (!existsSync(electronEntry)) {
    throw new Error(
      `Electron build entry not found at ${electronEntry}. Run "bunx electron-vite build -c electron.vite.config.ts" (or build:electron) first, or point CMUX_ELECTRON_ENTRY at your built main file.`
    );
  }

  console.log("[sentry] triggering electron errors from", electronEntry);
  const electronBinary = (await import("electron")).default as unknown as string;
  const electronApp = await electron.launch({
    args: [electronEntry],
    executablePath: electronBinary,
    cwd: clientDir,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ELECTRON_RENDERER_URL: defaultWebUrl,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(
      () => typeof (window as typeof window & { __cmuxTriggerSentryError?: () => void }).__cmuxTriggerSentryError === "function",
      undefined,
      { timeout: 20_000 }
    );

    // Renderer error
    await page.evaluate(() => {
      (window as typeof window & { __cmuxTriggerSentryError?: () => void }).__cmuxTriggerSentryError?.();
    });

    // Main-process error
    await electronApp.evaluate(async () => {
      const SentryMain = await import("@sentry/electron/main");
      SentryMain.captureException(
        new Error("cmux electron main playwright test error")
      );
    });

    await page.waitForTimeout(2_000);
  } finally {
    await electronApp.close();
  }
}

async function run() {
  await triggerWebErrors();
  await triggerElectronErrors();
  console.log("[sentry] test errors dispatched for web + electron");
}

void run().catch((error) => {
  console.error("[sentry] failed to trigger test errors", error);
  process.exitCode = 1;
});
