'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "cmux-pr-review-theme";

const PrReviewThemeContext = createContext<ThemeContextValue | null>(null);

export function PrReviewThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const previousHadDarkClass = useRef<boolean | undefined>(undefined);
  const previousDataTheme = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;

    if (previousHadDarkClass.current === undefined) {
      previousHadDarkClass.current = root.classList.contains("dark");
    }
    if (previousDataTheme.current === undefined) {
      previousDataTheme.current = root.dataset.theme;
    }

    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    root.dataset.theme = theme;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (typeof document === "undefined") {
        return;
      }

      const root = document.documentElement;

      if (previousHadDarkClass.current === true) {
        root.classList.add("dark");
      } else if (previousHadDarkClass.current === false) {
        root.classList.remove("dark");
      }

      if (previousDataTheme.current === undefined) {
        delete root.dataset.theme;
      } else {
        root.dataset.theme = previousDataTheme.current;
      }
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme]
  );

  return (
    <PrReviewThemeContext.Provider value={contextValue}>
      {children}
    </PrReviewThemeContext.Provider>
  );
}

export function usePrReviewTheme(): ThemeContextValue {
  const context = useContext(PrReviewThemeContext);
  if (!context) {
    throw new Error(
      "usePrReviewTheme must be used within a PrReviewThemeProvider"
    );
  }
  return context;
}
