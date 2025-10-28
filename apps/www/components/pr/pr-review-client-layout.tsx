'use client';

import type { ReactNode } from "react";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ThemeProvider } from "@/components/pr/pr-theme-provider";
import { ThemeToggleButton } from "@/components/pr/theme-toggle-button";

export function PrReviewClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexClientProvider>
      <ThemeProvider>
        <div className="min-h-dvh bg-white dark:bg-neutral-900 font-sans text-neutral-900 dark:text-neutral-50">
          {children}
          <ThemeToggleButton />
        </div>
      </ThemeProvider>
    </ConvexClientProvider>
  );
}
