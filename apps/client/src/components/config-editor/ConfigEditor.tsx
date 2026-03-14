import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  createConfigEditorExtensions,
  type ConfigLanguage,
} from "@/lib/codemirror/config-extensions";
import { useTheme } from "@/components/theme/use-theme";

export interface ConfigEditorProps {
  /** The config content to display/edit */
  value: string;
  /** Callback when content changes */
  onChange?: (value: string) => void;
  /** Language mode for syntax highlighting and validation */
  language: ConfigLanguage;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Minimum height of the editor */
  minHeight?: string;
  /** Maximum height of the editor */
  maxHeight?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Additional class name */
  className?: string;
}

/**
 * A CodeMirror-based config editor component with JSON/TOML support.
 * Provides syntax highlighting, linting, and validation.
 */
export function ConfigEditor({
  value,
  onChange,
  language,
  readOnly = false,
  minHeight = "200px",
  maxHeight = "500px",
  placeholder,
  className = "",
}: ConfigEditorProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const extensions = useMemo(
    () =>
      createConfigEditorExtensions(isDark ? "dark" : "light", {
        readOnly,
        language,
      }),
    [isDark, readOnly, language],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      if (!readOnly && onChange) {
        onChange(newValue);
      }
    },
    [readOnly, onChange],
  );

  return (
    <div className={`config-editor ${className}`}>
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        placeholder={placeholder}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
          tabSize: 2,
        }}
        style={{
          minHeight,
          maxHeight,
          overflow: "auto",
        }}
      />
    </div>
  );
}

export { type ConfigLanguage };
