'use client';

import type { ReactNode } from "react";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { PrReviewThemeProvider } from "@/components/pr/pr-review-theme-provider";

export function PrReviewClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexClientProvider>
      <PrReviewThemeProvider>
        <div className="min-h-dvh bg-neutral-50 font-sans text-neutral-900 transition-colors dark:bg-neutral-950 dark:text-neutral-100">
          {children}
        </div>
      </PrReviewThemeProvider>
    </ConvexClientProvider>
  );
}
