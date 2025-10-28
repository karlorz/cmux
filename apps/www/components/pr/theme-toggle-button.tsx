'use client';

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./pr-theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50 border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 text-neutral-700 dark:text-neutral-200" />
      ) : (
        <Sun className="h-5 w-5 text-neutral-700 dark:text-neutral-200" />
      )}
    </Button>
  );
}
