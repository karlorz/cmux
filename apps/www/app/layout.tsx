import type { ReactNode } from "react";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Geist } from "next/font/google";

import { stackServerApp } from "@/lib/utils/stack";
import { StackProvider, StackTheme } from "@stackframe/stack";

import clsx from "clsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "cmux - Open source terminal and control plane for AI coding agents",
  description:
    "cmux is the open source terminal and control plane for Claude Code, Codex, Gemini CLI, Amp, Opencode, and other coding agent CLIs across isolated VS Code workspaces.",
  openGraph: {
    title: "cmux - Open source terminal and control plane for AI coding agents",
    description:
      "Run and verify multiple AI coding agents with isolated VS Code workspaces",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "cmux - Open source terminal and control plane for AI coding agents",
    description:
      "Run and verify multiple AI coding agents with isolated VS Code workspaces",
  },
};

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-jetbrains-mono",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800"],
  style: ["normal"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={clsx(
        "dark",
        jetBrainsMono.className,
        jetBrainsMono.variable,
        geist.className,
        geist.variable,
      )}
    >
      <body
        className="antialiased bg-background text-foreground"
        style={{
          fontFamily:
            '"JetBrains Mono","SFMono-Regular","Menlo","Consolas","ui-monospace","Monaco","Courier New",monospace',
        }}
      >
        <StackTheme>
          <StackProvider app={stackServerApp}>{children}</StackProvider>
        </StackTheme>
      </body>
    </html>
  );
}
