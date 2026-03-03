import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let lastTheme: "dark" | "default" | null = null;

function initMermaid(isDark: boolean) {
  const theme = isDark ? "dark" : "default";
  // Re-initialize when theme changes
  if (lastTheme === theme) {
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: "strict",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    fontSize: 14,
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: "basis",
      padding: 20,
      nodeSpacing: 40,
      rankSpacing: 60,
    },
  });
  lastTheme = theme;
}

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const renderIdRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chart.trim()) {
      return;
    }

    const isDark = document.documentElement.classList.contains("dark");
    initMermaid(isDark);

    const currentRenderId = ++renderIdRef.current;
    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Date.now()}-${currentRenderId}`;
        const { svg } = await mermaid.render(id, chart);
        // Only update if this is still the latest render
        if (currentRenderId === renderIdRef.current && container) {
          container.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (currentRenderId === renderIdRef.current) {
          console.error("[MermaidDiagram] Failed to render:", err);
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      }
    };

    void renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        <p className="font-medium">Diagram render error</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className ?? "overflow-auto [&_svg]:min-w-fit"}
    />
  );
}
