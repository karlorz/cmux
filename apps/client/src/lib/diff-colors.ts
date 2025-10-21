export const GITHUB_ADDITION_LINE_BG = "#dafbe1";
export const GITHUB_ADDITION_GUTTER_BG = "#b8f0c8";
export const GITHUB_ADDITION_TEXT_BG = "#b8f0c8";
export const GITHUB_DELETION_LINE_BG = "#ffebe9";
export const GITHUB_DELETION_GUTTER_BG = "#ffdcd7";
export const GITHUB_DELETION_TEXT_BG = "#ffdcd7";

export const GITHUB_DARK_ADDITION_LINE = "#2ea04326";
export const GITHUB_DARK_ADDITION_GUTTER = "#3fb9504d";
export const GITHUB_DARK_DELETION_LINE = "#f851491a";
export const GITHUB_DARK_DELETION_GUTTER = "#f851494d";

export const GITHUB_ADDITION_LINE_NUMBER_LIGHT = "#116329";
export const GITHUB_ADDITION_LINE_NUMBER_DARK = "#7ee787";
export const GITHUB_DELETION_LINE_NUMBER_LIGHT = "#a0111f";
export const GITHUB_DELETION_LINE_NUMBER_DARK = "#ff7b72";

export const GITHUB_COLLAPSED_LIGHT_BG = "#E9F4FF";
export const GITHUB_COLLAPSED_LIGHT_TEXT = "#4b5563";
export const GITHUB_COLLAPSED_DARK_BG = "#1f2733";
export const GITHUB_COLLAPSED_DARK_TEXT = "#e5e7eb";

export const GITHUB_DIFF_COLORS = {
  light: {
    addition: {
      line: GITHUB_ADDITION_LINE_BG,
      gutter: GITHUB_ADDITION_GUTTER_BG,
      text: GITHUB_ADDITION_TEXT_BG,
      lineNumber: GITHUB_ADDITION_LINE_NUMBER_LIGHT,
    },
    deletion: {
      line: GITHUB_DELETION_LINE_BG,
      gutter: GITHUB_DELETION_GUTTER_BG,
      text: GITHUB_DELETION_TEXT_BG,
      lineNumber: GITHUB_DELETION_LINE_NUMBER_LIGHT,
    },
    collapsed: {
      background: GITHUB_COLLAPSED_LIGHT_BG,
      text: GITHUB_COLLAPSED_LIGHT_TEXT,
    },
  },
  dark: {
    addition: {
      line: GITHUB_DARK_ADDITION_LINE,
      gutter: GITHUB_DARK_ADDITION_GUTTER,
      text: GITHUB_DARK_ADDITION_LINE,
      lineNumber: GITHUB_ADDITION_LINE_NUMBER_DARK,
    },
    deletion: {
      line: GITHUB_DARK_DELETION_LINE,
      gutter: GITHUB_DARK_DELETION_GUTTER,
      text: GITHUB_DARK_DELETION_LINE,
      lineNumber: GITHUB_DELETION_LINE_NUMBER_DARK,
    },
    collapsed: {
      background: GITHUB_COLLAPSED_DARK_BG,
      text: GITHUB_COLLAPSED_DARK_TEXT,
    },
  },
} as const;

export type GitHubDiffPalette = typeof GITHUB_DIFF_COLORS;
