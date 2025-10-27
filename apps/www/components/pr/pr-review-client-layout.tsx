'use client';

import type { ReactNode } from "react";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ThemeProvider } from "@/components/pr/theme-provider";

export function PrReviewClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexClientProvider>
      <ThemeProvider>
        <div className="min-h-dvh bg-neutral-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
          {children}
        </div>
      </ThemeProvider>
    </ConvexClientProvider>
  );
}
