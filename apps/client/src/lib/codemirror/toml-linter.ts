import type { EditorView } from "@codemirror/view";
import type { Diagnostic } from "@codemirror/lint";
import { parse as parseToml } from "smol-toml";

/**
 * Create a CodeMirror linter for TOML content using smol-toml.
 * Returns diagnostics for parse errors with line/column information.
 */
export function tomlParseLinter() {
  return (view: EditorView): Diagnostic[] => {
    const content = view.state.doc.toString();
    if (!content.trim()) {
      return [];
    }

    try {
      parseToml(content);
      return [];
    } catch (e) {
      const error = e as Error & { line?: number; column?: number };
      const message = error.message || "Invalid TOML syntax";

      // smol-toml provides line/column info in the error
      // Default to start of document if not available
      let from = 0;
      let to = Math.min(content.length, 100);

      if (typeof error.line === "number" && error.line > 0) {
        const lines = content.split("\n");
        let pos = 0;
        for (let i = 0; i < error.line - 1 && i < lines.length; i++) {
          pos += lines[i].length + 1; // +1 for newline
        }
        from = pos;
        const lineContent = lines[error.line - 1] || "";
        to = pos + lineContent.length;

        if (typeof error.column === "number" && error.column > 0) {
          from = pos + Math.min(error.column - 1, lineContent.length);
          to = from + 1;
        }
      }

      return [
        {
          from,
          to,
          severity: "error",
          message,
        },
      ];
    }
  };
}
