import readline from "node:readline";
import process from "node:process";
import type { EditorSettingsCandidate } from "./editorSettingsDiscovery";

function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function promptForEditorSelection(
  candidates: EditorSettingsCandidate[]
): Promise<EditorSettingsCandidate | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  console.log(
    "\nWe can copy your VS Code settings and theme so every cmux workspace feels familiar."
  );
  candidates.forEach((candidate, index) => {
    console.log(
      `  ${index + 1}. ${candidate.label} — ${candidate.settingsPath}`
    );
  });
  console.log("  0. Skip for now");

  const answer = await askQuestion(
    `Select a number to import settings [0-${candidates.length}]: `
  );
  const choice = Number.parseInt(answer.trim(), 10);

  if (
    Number.isNaN(choice) ||
    choice <= 0 ||
    choice > candidates.length
  ) {
    console.log("Skipping VS Code settings import for now.");
    return null;
  }

  return candidates[choice - 1] ?? null;
}
