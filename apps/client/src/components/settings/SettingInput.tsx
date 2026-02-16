import { useState } from "react";
import { SettingRow } from "./SettingRow";

interface SettingInputProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  type?: "text" | "password";
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function SettingInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  prefix,
  type = "text",
  error,
  disabled,
  className,
}: SettingInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputType = type === "password" && showPassword ? "text" : type;

  return (
    <SettingRow label={label} description={description} className={className}>
      <div className="flex flex-col items-end gap-1">
        <div
          className={`inline-flex items-center rounded-lg bg-white dark:bg-neutral-900 border ${
            error
              ? "border-red-500"
              : "border-neutral-300 dark:border-neutral-700"
          }`}
        >
          {prefix && (
            <span className="px-3 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 select-none bg-neutral-50 dark:bg-neutral-800/50 border-r border-neutral-200 dark:border-neutral-700 rounded-l-lg">
              {prefix}
            </span>
          )}
          <input
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm bg-transparent border-0 outline-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset text-neutral-900 dark:text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed ${
              prefix ? "rounded-r-lg" : "rounded-lg"
            } ${type === "password" ? "pr-8 font-mono" : ""}`}
          />
          {type === "password" && (
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2 p-1 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              {showPassword ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-500">{error}</p>
        )}
      </div>
    </SettingRow>
  );
}
