import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAcceleratorForDisplay } from "@cmux/shared";

type ShortcutRecorderProps = {
  value: string | null;
  defaultValue: string;
  onChange: (accelerator: string | null) => void;
  className?: string;
};

const MODIFIER_KEYS = new Set(["shift", "control", "ctrl", "alt", "meta"]);

function normalizeKeyboardEventKey(key: string): string | null {
  const lower = key.toLowerCase();
  if (MODIFIER_KEYS.has(lower)) return null;

  switch (lower) {
    case "esc":
      return "escape";
    case " ":
    case "space":
    case "spacebar":
      return " ";
    default:
      return lower;
  }
}

function formatKeyForAccelerator(key: string): string | null {
  if (key === " ") return "Space";
  const map: Record<string, string> = {
    enter: "Enter",
    escape: "Escape",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    insert: "Insert",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
  };
  if (map[key]) return map[key];

  if (key.length === 1) {
    if (/[a-z]/.test(key)) return key.toUpperCase();
    return key;
  }

  if (key.startsWith("f") && /^\d+$/.test(key.slice(1))) {
    return key.toUpperCase();
  }

  return key.charAt(0).toUpperCase() + key.slice(1);
}

function keyboardEventToAccelerator(event: KeyboardEvent): string | null {
  const normalizedKey = normalizeKeyboardEventKey(event.key);
  if (!normalizedKey) return null;

  const keyToken = formatKeyForAccelerator(normalizedKey);
  if (!keyToken) return null;

  const parts: string[] = [];

  if (event.metaKey) {
    if (!event.ctrlKey) {
      parts.push("CommandOrControl");
    } else {
      parts.push("Command");
    }
  }
  if (event.ctrlKey) {
    parts.push("Control");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }

  parts.push(keyToken);

  return parts.join("+");
}

export function ShortcutRecorder({
  value,
  defaultValue,
  onChange,
  className,
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        event.key === "Escape" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        setIsRecording(false);
        return;
      }

      const accelerator = keyboardEventToAccelerator(event);
      if (!accelerator) {
        return;
      }

      onChange(accelerator);
      setIsRecording(false);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isRecording, onChange]);

  const displayValue = useMemo(() => {
    if (isRecording) return "Press keys…";
    return formatAcceleratorForDisplay(value);
  }, [isRecording, value]);

  const isDefault = value === defaultValue;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsRecording((prev) => !prev)}
      >
        {displayValue}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(null)}
        disabled={!value}
      >
        Disable
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(defaultValue)}
        disabled={isDefault}
      >
        Reset
      </Button>
    </div>
  );
}
