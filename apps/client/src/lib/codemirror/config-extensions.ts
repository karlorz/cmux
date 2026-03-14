import { EditorView } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import {
  StreamLanguage,
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { toml as tomlLanguage } from "@codemirror/legacy-modes/mode/toml";
import { linter, lintGutter } from "@codemirror/lint";
import { parse as parseToml } from "smol-toml";
import { tomlParseLinter } from "./toml-linter";
import { darkHighlightStyle } from "./shared-highlight-styles";

export type ConfigLanguage = "json" | "toml";

/**
 * Get language extensions for config editor based on language type.
 */
export function getConfigLanguageExtension(language: ConfigLanguage): Extension[] {
  switch (language) {
    case "json":
      return [json(), linter(jsonParseLinter())];
    case "toml":
      return [StreamLanguage.define(tomlLanguage), linter(tomlParseLinter())];
    default:
      return [];
  }
}

/**
 * Create base extensions for config editor with theming and linting.
 */
export function createConfigEditorExtensions(
  theme: "light" | "dark",
  options?: {
    readOnly?: boolean;
    language?: ConfigLanguage;
  },
): Extension[] {
  const isDark = theme === "dark";
  const textColor = isDark ? "#e5e7eb" : "#1f2937";
  const bgColor = isDark ? "#171717" : "#fafafa";
  const gutterBgColor = isDark ? "#171717" : "#fafafa";
  const gutterColor = isDark ? "#9ca3af" : "#6b7280";
  const borderColor = isDark ? "#404040" : "#e5e5e5";
  const selectionBg = isDark ? "rgba(148, 163, 184, 0.35)" : "rgba(148, 163, 184, 0.25)";
  const activeLineBg = isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(15, 23, 42, 0.04)";

  const baseTheme = EditorView.theme(
    {
      "&": {
        fontFamily:
          "'Menlo', 'JetBrains Mono', 'SF Mono', Monaco, 'Courier New', monospace",
        fontSize: "13px",
        lineHeight: "20px",
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: "8px",
        border: `1px solid ${borderColor}`,
      },
      "&.cm-focused": {
        outline: "none",
        borderColor: isDark ? "#525252" : "#a3a3a3",
      },
      ".cm-scroller": {
        fontFamily:
          "'Menlo', 'JetBrains Mono', 'SF Mono', Monaco, 'Courier New', monospace",
        lineHeight: "20px",
        overflow: "auto",
      },
      ".cm-content": {
        padding: "8px 0",
        caretColor: textColor,
      },
      ".cm-gutters": {
        backgroundColor: gutterBgColor,
        border: "none",
        color: gutterColor,
        borderTopLeftRadius: "8px",
        borderBottomLeftRadius: "8px",
      },
      ".cm-gutterElement": {
        padding: "0 12px 0 8px",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        fontSize: "12px",
        minWidth: "32px",
      },
      ".cm-activeLine": {
        backgroundColor: activeLineBg,
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: isDark ? "#d4d4d8" : "#4b5563",
      },
      ".cm-selectionBackground, & ::selection": {
        backgroundColor: selectionBg,
      },
      ".cm-cursor": {
        borderLeftColor: textColor,
        borderLeftWidth: "2px",
      },
      // Lint gutter styling
      ".cm-lint-marker": {
        width: "8px",
        height: "8px",
      },
      ".cm-lint-marker-error": {
        content: '""',
        backgroundColor: "#ef4444",
        borderRadius: "50%",
      },
      ".cm-lint-marker-warning": {
        content: '""',
        backgroundColor: "#f59e0b",
        borderRadius: "50%",
      },
      // Diagnostic tooltip styling
      ".cm-tooltip.cm-tooltip-lint": {
        backgroundColor: isDark ? "#262626" : "#ffffff",
        border: `1px solid ${borderColor}`,
        borderRadius: "6px",
        boxShadow: isDark
          ? "0 4px 6px -1px rgba(0, 0, 0, 0.3)"
          : "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
      },
      ".cm-diagnostic": {
        padding: "6px 10px",
        fontSize: "12px",
      },
      ".cm-diagnostic-error": {
        borderLeft: "3px solid #ef4444",
        color: textColor,
      },
    },
    { dark: isDark },
  );

  const extensions: Extension[] = [
    EditorView.lineWrapping,
    lintGutter(),
    syntaxHighlighting(isDark ? darkHighlightStyle : defaultHighlightStyle, {
      fallback: true,
    }),
    baseTheme,
  ];

  if (options?.readOnly) {
    extensions.push(EditorState.readOnly.of(true));
    extensions.push(EditorView.editable.of(false));
  }

  if (options?.language) {
    extensions.push(...getConfigLanguageExtension(options.language));
  }

  return extensions;
}

/**
 * Validate config content based on language type.
 * Returns null if valid, error message if invalid.
 */
export function validateConfig(
  content: string,
  language: ConfigLanguage,
): string | null {
  if (!content.trim()) {
    return null;
  }

  try {
    if (language === "json") {
      JSON.parse(content);
    } else if (language === "toml") {
      parseToml(content);
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid syntax";
  }
}
