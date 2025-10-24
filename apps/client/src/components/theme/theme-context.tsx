import { createContext } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export type ThemeProviderState = {
  // User-selected mode (can be "system")
  theme: Theme;
  // Effective theme after resolving "system"
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  syncThemeToVSCode: (theme: "dark" | "light") => void;
};

export const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
  syncThemeToVSCode: () => null,
};

export const ThemeProviderContext =
  createContext<ThemeProviderState>(initialState);
