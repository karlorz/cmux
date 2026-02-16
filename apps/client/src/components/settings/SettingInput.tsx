import { Eye, EyeOff } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface SettingInputProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  type?: "text" | "password";
  isVisible?: boolean;
  onToggleVisibility?: () => void;
  error?: string;
  rows?: number;
  monospace?: boolean;
  autoComplete?: string;
  noBorder?: boolean;
}

export function SettingInput({
  id,
  label,
  description,
  value,
  onChange,
  placeholder,
  prefix,
  type = "text",
  isVisible,
  onToggleVisibility,
  error,
  rows,
  monospace,
  autoComplete,
  noBorder,
}: SettingInputProps) {
  const showToggle = type === "password" && typeof onToggleVisibility === "function";
  const inputType = showToggle && isVisible ? "text" : type;
  const baseInputClass = `w-full px-3 py-2 ${showToggle ? "pr-10" : ""} border rounded-lg bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:border-transparent ${
    monospace ? "font-mono text-xs" : ""
  } ${
    error
      ? "border-red-500 focus:ring-red-500"
      : "border-neutral-300 dark:border-neutral-700 focus:ring-blue-500"
  }`;

  const inputControl = rows && rows > 1 ? (
    <textarea
      id={id}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={`${baseInputClass} resize-y`}
      placeholder={placeholder}
      autoComplete={autoComplete}
    />
  ) : (
    <input
      id={id}
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={baseInputClass}
      placeholder={placeholder}
      autoComplete={autoComplete}
    />
  );

  return (
    <SettingRow label={label} description={description} noBorder={noBorder}>
      <div>
        {prefix && !(rows && rows > 1) ? (
          <div
            className={`inline-flex items-center w-full rounded-lg border ${
              error
                ? "border-red-500"
                : "border-neutral-300 dark:border-neutral-700"
            } bg-white dark:bg-neutral-900`}
          >
            <span className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400 select-none bg-neutral-50 dark:bg-neutral-800/50 border-r border-neutral-200 dark:border-neutral-700 rounded-l-lg">
              {prefix}
            </span>
            <input
              id={id}
              type={inputType}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`flex-1 bg-transparent border-0 outline-none focus:outline-none focus:ring-2 focus:ring-inset px-3 py-2 text-sm rounded-r-lg ${
                error
                  ? "focus:ring-red-500 text-neutral-900 dark:text-neutral-100"
                  : "focus:ring-blue-500 text-neutral-900 dark:text-neutral-100"
              }`}
              placeholder={placeholder}
              autoComplete={autoComplete}
            />
          </div>
        ) : showToggle ? (
          <div className="relative">
            {inputControl}
            <button
              type="button"
              onClick={onToggleVisibility}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          inputControl
        )}
        {error ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-500">{error}</p>
        ) : null}
      </div>
    </SettingRow>
  );
}
