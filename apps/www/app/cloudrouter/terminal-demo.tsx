"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";

// --- Types ---

interface LineFragment {
  text: string;
  color?: string;
}

type Line = string | LineFragment[];

interface Step {
  type?: "user" | "agent" | "tool";
  command: string;
  output: Line[];
  pauseAfter?: number;
}

// --- Demo script (Claude Code session) ---

const STEPS: Step[] = [
  // User asks Claude Code to deploy
  {
    type: "user",
    command: "Deploy my Next.js app to a cloud sandbox",
    output: [],
    pauseAfter: 400,
  },
  // Agent thinks
  {
    type: "agent",
    command: "I'll create a cloud sandbox, upload your project, and start the dev server.",
    output: [],
    pauseAfter: 500,
  },
  // Tool: start sandbox
  {
    type: "tool",
    command: "cloudrouter start . --name my-app",
    output: [
      "",
      [{ text: "    Waiting for sandbox to initialize.", color: "#a3a3a3" }],
      [
        { text: "    ✓ Synced 247 files (12.4 MB) in 3.2s", color: "#22c55e" },
      ],
      [
        { text: "    Created sandbox: ", color: "#a3a3a3" },
        { text: "cr_x7k9m2p", color: "#d4d4d4" },
      ],
      [
        { text: "      Type:   ", color: "#737373" },
        { text: "Docker", color: "#d4d4d4" },
      ],
      [
        { text: "      Status: ", color: "#737373" },
        { text: "running", color: "#22c55e" },
      ],
      [
        { text: "      VSCode: ", color: "#737373" },
        { text: "https://39378-x7k9m2p.e2b.app", color: "#38bdf8" },
      ],
      "",
    ],
    pauseAfter: 600,
  },
  // Agent thinks
  {
    type: "agent",
    command: "Let me install dependencies and start the dev server.",
    output: [],
    pauseAfter: 400,
  },
  // Tool: ssh npm install && npm run dev
  {
    type: "tool",
    command: 'cloudrouter ssh cr_x7k9m2p "npm install && npm run dev"',
    output: [
      "",
      [{ text: "    added 1,247 packages in 8s", color: "#a3a3a3" }],
      "",
      [{ text: "    > my-app@0.1.0 dev", color: "#a3a3a3" }],
      [{ text: "    > next dev", color: "#a3a3a3" }],
      "",
      [{ text: "    ▲ Next.js 15.1.0", color: "#d4d4d4" }],
      [
        { text: "    - Local:   ", color: "#a3a3a3" },
        { text: "http://localhost:3000", color: "#38bdf8" },
      ],
      [{ text: "    ✓ Ready in 1.8s", color: "#22c55e" }],
      "",
    ],
    pauseAfter: 500,
  },
  // Agent thinks
  {
    type: "agent",
    command: "Dev server is running. Let me verify the app loads correctly.",
    output: [],
    pauseAfter: 400,
  },
  // Tool: browser snapshot
  {
    type: "tool",
    command: "cloudrouter browser snapshot cr_x7k9m2p",
    output: [
      "",
      [{ text: "    - document:", color: "#a3a3a3" }],
      [
        { text: "      - heading ", color: "#a3a3a3" },
        { text: '"Create Next App"', color: "#d4d4d4" },
        { text: " [ref=e1]", color: "#a78bfa" },
      ],
      [{ text: "      - main:", color: "#a3a3a3" }],
      [
        { text: "        - paragraph: ", color: "#a3a3a3" },
        { text: "Get started by editing ", color: "#d4d4d4" },
        { text: "src/app/page.tsx", color: "#fbbf24" },
      ],
      [{ text: "        - navigation:", color: "#a3a3a3" }],
      [
        { text: "          - link ", color: "#a3a3a3" },
        { text: '"Docs"', color: "#d4d4d4" },
        { text: " [ref=e2]", color: "#a78bfa" },
      ],
      [
        { text: "          - link ", color: "#a3a3a3" },
        { text: '"Learn"', color: "#d4d4d4" },
        { text: " [ref=e3]", color: "#a78bfa" },
      ],
      "",
    ],
    pauseAfter: 500,
  },
  // Agent summary
  {
    type: "agent",
    command: "Your Next.js app is deployed and running in a cloud sandbox!",
    output: [],
  },
];

// --- Helpers ---

const CHAR_DELAY = 32;
const CHAR_VARIANCE = 18;
const STEP_PAUSE = 800;

function randomDelay(base: number, variance: number) {
  return base + (Math.random() * variance * 2 - variance);
}

// --- Component ---

function RenderedLine({ line }: { line: Line }) {
  if (typeof line === "string") {
    return <div className="min-h-[1.35em]">{line || "\u00A0"}</div>;
  }
  return (
    <div className="min-h-[1.35em]">
      {line.map((fragment, i) => (
        <span key={i} style={fragment.color ? { color: fragment.color } : undefined}>
          {fragment.text}
        </span>
      ))}
    </div>
  );
}

export function TerminalDemo() {
  const [lines, setLines] = useState<Array<{ key: string; content: Line }>>([]);
  const [currentTyping, setCurrentTyping] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const { scrollRef, contentRef } = useStickToBottom({
    resize: "instant",
    initial: "instant",
  });
  const abortRef = useRef<AbortController | null>(null);
  const lineCounterRef = useRef(0);

  const sleep = useCallback((ms: number, signal?: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }, []);

  const addLine = useCallback(
    (content: Line) => {
      const key = `line-${lineCounterRef.current++}`;
      setLines((prev) => [...prev, { key, content }]);
    },
    [],
  );

  const typeCommand = useCallback(
    async (cmd: string, signal: AbortSignal) => {
      for (let i = 0; i <= cmd.length; i++) {
        signal.throwIfAborted();
        setCurrentTyping(cmd.slice(0, i));
        if (i < cmd.length) {
          await sleep(randomDelay(CHAR_DELAY, CHAR_VARIANCE), signal);
        }
      }
    },
    [sleep],
  );

  const renderStepLines = useCallback(
    (step: Step) => {
      const type = step.type ?? "user";

      if (type === "user") {
        // ❯ command
        addLine([
          { text: "❯ ", color: "#22c55e" },
          { text: step.command, color: "#d4d4d4" },
        ]);
      } else if (type === "agent") {
        // ⏺ text
        addLine([
          { text: "⏺ ", color: "#818cf8" },
          { text: step.command, color: "#d4d4d4" },
        ]);
      } else if (type === "tool") {
        // ⏺  Bash  command
        addLine([
          { text: "  ⏺ ", color: "#818cf8" },
          { text: "Bash ", color: "#737373" },
          { text: step.command, color: "#d4d4d4" },
        ]);
      }

      // Output lines
      for (const outputLine of step.output) {
        addLine(outputLine);
      }
    },
    [addLine],
  );

  const runDemo = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    try {
      setLines([]);
      setIsComplete(false);
      lineCounterRef.current = 0;

      await sleep(600, signal);

      for (let stepIdx = 0; stepIdx < STEPS.length; stepIdx++) {
        const step = STEPS[stepIdx];
        const type = step.type ?? "user";

        if (type === "user") {
          // Type the user command
          setCurrentTyping("");
          setShowCursor(true);

          await sleep(300, signal);
          await typeCommand(step.command, signal);
          await sleep(200, signal);

          // "Submit" — add as line and clear typing
          setCurrentTyping("");
          setShowCursor(false);
          renderStepLines(step);
        } else {
          // Agent text and tool calls appear instantly
          setShowCursor(false);
          await sleep(300, signal);
          renderStepLines(step);
        }

        // Pause between steps
        const pause = step.pauseAfter ?? STEP_PAUSE;
        await sleep(pause, signal);
      }

      // Demo complete — show cursor again
      setShowCursor(true);
      setCurrentTyping("");
      setIsComplete(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      console.error("Terminal demo error:", err);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [isRunning, sleep, typeCommand, renderStepLines]);

  const skipToEnd = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Render all steps at once
    const allLines: Array<{ key: string; content: Line }> = [];
    let counter = 0;

    const addSkipLine = (content: Line) => {
      allLines.push({ key: `line-${counter++}`, content });
    };

    for (const step of STEPS) {
      const type = step.type ?? "user";

      if (type === "user") {
        addSkipLine([
          { text: "❯ ", color: "#22c55e" },
          { text: step.command, color: "#d4d4d4" },
        ]);
      } else if (type === "agent") {
        addSkipLine([
          { text: "⏺ ", color: "#818cf8" },
          { text: step.command, color: "#d4d4d4" },
        ]);
      } else if (type === "tool") {
        addSkipLine([
          { text: "  ⏺ ", color: "#818cf8" },
          { text: "Bash ", color: "#737373" },
          { text: step.command, color: "#d4d4d4" },
        ]);
      }

      for (const outputLine of step.output) {
        addSkipLine(outputLine);
      }
    }

    lineCounterRef.current = counter;
    setLines(allLines);
    setCurrentTyping("");
    setShowCursor(true);
    setIsComplete(true);
    setIsRunning(false);
  }, []);

  const restart = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLines([]);
    setCurrentTyping("");
    setShowCursor(true);
    setIsComplete(false);
    setIsRunning(false);
    lineCounterRef.current = 0;
    setTimeout(() => {
      runDemo();
    }, 100);
  }, [runDemo]);

  // Auto-start on mount
  useEffect(() => {
    runDemo();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blinking cursor
  const [cursorVisible, setCursorVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="group relative mx-auto w-full max-w-3xl"
      onKeyDown={(e) => {
        if (e.key === "Enter" && isRunning) {
          skipToEnd();
        }
      }}
    >
      {/* Terminal window */}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-[#0a0a0a] shadow-2xl shadow-black/50">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-neutral-800 bg-[#1a1a1a] px-4 py-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              className="h-3 w-3 rounded-full bg-[#ff5f57] transition hover:brightness-110"
              aria-label="Close"
              onClick={restart}
            />
            <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="ml-2 flex-1 select-none text-center text-xs text-neutral-500">
            Claude Code
          </span>
        </div>

        {/* Terminal body */}
        <div
          ref={scrollRef}
          className="h-[420px] overflow-y-auto font-mono text-[13px] leading-[1.35] sm:h-[480px] sm:text-sm"
          onClick={() => {
            if (isRunning) skipToEnd();
          }}
        >
          <div ref={contentRef} className="p-4">
            {/* Rendered lines */}
            {lines.map((line) => (
              <RenderedLine key={line.key} line={line.content} />
            ))}

            {/* Current prompt + typing */}
            {showCursor && (
              <div className="min-h-[1.35em]">
                <span style={{ color: "#22c55e" }}>❯ </span>
                <span style={{ color: "#d4d4d4" }}>{currentTyping}</span>
                <span
                  className="inline-block h-[1.1em] w-[0.55em] translate-y-[0.15em] align-baseline"
                  style={{
                    backgroundColor: cursorVisible ? "#d4d4d4" : "transparent",
                  }}
                />
              </div>
            )}

            {/* Completion message */}
            {isComplete && (
              <div className="mt-4">
                <div className="min-h-[1.35em]" />
                <div className="min-h-[1.35em] text-neutral-600">
                  {"  "}— Demo complete. Click the{" "}
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff5f57] align-middle" />{" "}
                  button or press{" "}
                  <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                    R
                  </kbd>{" "}
                  to replay.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Click hint */}
      <div className={`mt-3 text-center text-xs text-neutral-600 transition-opacity ${isRunning ? "opacity-100" : "opacity-0"}`}>
        Click terminal or press Enter to skip animation
      </div>

      {/* Keyboard listener for restart */}
      <KeyboardListener
        onRestart={restart}
        isComplete={isComplete}
      />
    </div>
  );
}

function KeyboardListener({
  onRestart,
  isComplete,
}: {
  onRestart: () => void;
  isComplete: boolean;
}) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isComplete && e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        onRestart();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isComplete, onRestart]);

  return null;
}
