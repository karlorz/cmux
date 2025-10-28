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
        {children}
      </ThemeProvider>
    </ConvexClientProvider>
  );
}
