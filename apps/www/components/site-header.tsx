"use client";

import CmuxLogo from "@/components/logo/cmux-logo";
import { MacDownloadLink } from "@/components/mac-download-link";
import { CMUX_GITHUB_REPO_URL } from "@/lib/constants";
import type { MacDownloadUrls } from "@/lib/releases";
import clsx from "clsx";
import { Download, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export const NAV_ITEMS = [
  { id: "about", label: "About" },
  { id: "workflow", label: "Workflow" },
  { id: "verification", label: "Verification" },
];

type SiteHeaderProps = {
  linkPrefix?: string;
  showDownload?: boolean;
  fallbackUrl?: string;
  latestVersion?: string | null;
  macDownloadUrls?: MacDownloadUrls;
  extraEndContent?: ReactNode;
  githubStarCount?: number | null;
};

const DEFAULT_DOWNLOAD_URLS: MacDownloadUrls = {
  universal: null,
  arm64: null,
  x64: null,
};

export function SiteHeader({
  linkPrefix = "",
  showDownload = true,
  fallbackUrl = "https://github.com/manaflow-ai/cmux/releases",
  latestVersion,
  macDownloadUrls,
  extraEndContent,
  githubStarCount = null,
}: SiteHeaderProps) {
  const effectiveUrls = macDownloadUrls ?? DEFAULT_DOWNLOAD_URLS;
  const [isScrolled, setIsScrolled] = useState(false);
  const formattedStarCount =
    typeof githubStarCount === "number"
      ? new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(githubStarCount)
      : null;
  const githubLinkLabel = formattedStarCount
    ? `cmux on GitHub — ${formattedStarCount} stars`
    : "cmux on GitHub";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 backdrop-blur transition-colors",
        isScrolled
          ? "border-b border-white/10 bg-transparent"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div
        className={clsx(
          "mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6",
          isScrolled ? "py-3" : "py-4"
        )}
      >
        <Link aria-label="cmux" href="/">
          <div className="flex items-center gap-3">
            <CmuxLogo height={36} label="cmux" showWordmark />
          </div>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              className="text-neutral-300 transition hover:text-white"
              href={`${linkPrefix}#nav-${item.id}`}
            >
              {item.label}
            </Link>
          ))}
          {/* <Link className="text-neutral-300 transition hover:text-white" href="/tutorial">
            Tutorial
          </Link> */}
          <a
            className="text-neutral-300 transition hover:text-white"
            href="https://cal.com/team/manaflow/meeting"
            rel="noopener noreferrer"
            target="_blank"
          >
            Contact
          </a>
        </nav>
        <div className="flex items-center gap-3">
          {extraEndContent}
          <a
            aria-label={githubLinkLabel}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-white/30 hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm"
            href={CMUX_GITHUB_REPO_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Star className="h-4 w-4 text-yellow-300" aria-hidden fill="currentColor" />
            <span className="hidden sm:inline">GitHub</span>
            <span className="sm:hidden">Star</span>
            {formattedStarCount ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] font-semibold text-yellow-200 sm:text-xs">
                {formattedStarCount}
              </span>
            ) : null}
          </a>
          {showDownload ? (
            <MacDownloadLink
              autoDetect
              fallbackUrl={fallbackUrl}
              className="hidden md:inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-neutral-100"
              title={
                latestVersion
                  ? `Download cmux ${latestVersion} for macOS`
                  : "Download cmux for macOS"
              }
              urls={effectiveUrls}
            >
              <Download className="h-4 w-4" aria-hidden />
              <span>Download</span>
            </MacDownloadLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}
