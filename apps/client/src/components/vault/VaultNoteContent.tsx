/**
 * VaultNoteContent Component
 *
 * Renders markdown content from an Obsidian vault note.
 * Production-ready with syntax highlighting, link handling, and large content support.
 *
 * Wiki link behavior:
 * - Click: Navigate to note in vault UI (if onNavigateToNote provided)
 * - Ctrl/Cmd+Click: Open in Obsidian
 */

import {
  isValidElement,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, FileText, Link as LinkIcon } from "lucide-react";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { cn } from "@/lib/utils";
import {
  transformObsidianLinks,
  WIKI_LINK_PREFIX,
} from "./vault-note-markdown";

interface VaultNoteContentProps {
  content: string;
  className?: string;
  /** Maximum characters to show before truncating with "Show more". Default: 50000 */
  maxLength?: number;
  /** Vault name for Obsidian links. Default: "obsidian_vault" */
  vaultName?: string;
  /** Callback to navigate to another note in the vault UI */
  onNavigateToNote?: (notePath: string) => void;
}

// Max content length before we offer to truncate (50KB of text)
const DEFAULT_MAX_LENGTH = 50000;
const DEFAULT_VAULT_NAME = "obsidian_vault";

function extractPlainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractPlainText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractPlainText(node.props.children);
  }

  return "";
}

function slugifyHeadingText(headingText: string): string {
  const normalized = headingText
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}_ -]/gu, "")
    .replace(/\s/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "section";
}

function buildHeadingIds(markdown: string): Map<number, string> {
  const headingIds = new Map<number, string>();
  const seen = new Map<string, number>();
  let inFencedCodeBlock = false;

  for (const [index, rawLine] of markdown.split("\n").entries()) {
    if (/^\s*```/.test(rawLine)) {
      inFencedCodeBlock = !inFencedCodeBlock;
    }

    if (inFencedCodeBlock) {
      continue;
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (!match) {
      continue;
    }

    const headingText = match[2].replace(/\s+#+\s*$/, "");
    const baseSlug = slugifyHeadingText(headingText);
    const duplicateCount = seen.get(baseSlug) ?? 0;
    seen.set(baseSlug, duplicateCount + 1);

    headingIds.set(
      index + 1,
      duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`
    );
  }

  return headingIds;
}

export function VaultNoteContent({
  content,
  className,
  maxLength = DEFAULT_MAX_LENGTH,
  vaultName = DEFAULT_VAULT_NAME,
  onNavigateToNote,
}: VaultNoteContentProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isLargeContent = content.length > maxLength;
  const displayContent = useMemo(() => {
    const rawContent = isLargeContent && !isExpanded
      ? content.slice(0, maxLength) + "\n\n..."
      : content;
    return transformObsidianLinks(rawContent);
  }, [content, isLargeContent, isExpanded, maxLength]);
  const headingIdsByLine = useMemo(
    () => buildHeadingIds(displayContent),
    [displayContent]
  );

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (!content.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-neutral-400 dark:text-neutral-500">
        <FileText className="size-8 mb-2" aria-hidden="true" />
        <p className="text-sm">This note is empty</p>
      </div>
    );
  }

  return (
    <div className={className}>
      <article
        className={cn(
          "max-w-none break-words text-[16px] leading-6 text-neutral-800 dark:text-neutral-200",
          "[&_svg]:max-w-full"
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children, node, ...props }) => (
              (() => {
                const headingText = extractPlainText(children);
                const headingId =
                  headingIdsByLine.get(node?.position?.start.line ?? -1) ??
                  slugifyHeadingText(headingText);

                return (
                  <h1
                    id={headingId}
                    className="group relative mb-4 scroll-mt-24 border-b border-neutral-300 pb-2.5 text-[2rem] font-semibold leading-10 text-neutral-900 dark:border-neutral-700 dark:text-neutral-50"
                    {...props}
                  >
                    <a
                      href={`#${headingId}`}
                      aria-label={`Permalink: ${headingText}`}
                      className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus:opacity-100 focus:outline-none group-hover:opacity-100 sm:inline-flex dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <LinkIcon className="size-4" aria-hidden="true" />
                    </a>
                    {children}
                  </h1>
                );
              })()
            ),
            h2: ({ children, node, ...props }) => (
              (() => {
                const headingText = extractPlainText(children);
                const headingId =
                  headingIdsByLine.get(node?.position?.start.line ?? -1) ??
                  slugifyHeadingText(headingText);

                return (
                  <h2
                    id={headingId}
                    className="group relative mt-6 mb-4 scroll-mt-24 border-b border-neutral-300 pb-[7px] text-2xl font-semibold leading-[30px] text-neutral-900 dark:border-neutral-700 dark:text-neutral-50"
                    {...props}
                  >
                    <a
                      href={`#${headingId}`}
                      aria-label={`Permalink: ${headingText}`}
                      className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus:opacity-100 focus:outline-none group-hover:opacity-100 sm:inline-flex dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <LinkIcon className="size-4" aria-hidden="true" />
                    </a>
                    {children}
                  </h2>
                );
              })()
            ),
            h3: ({ children, node, ...props }) => (
              (() => {
                const headingText = extractPlainText(children);
                const headingId =
                  headingIdsByLine.get(node?.position?.start.line ?? -1) ??
                  slugifyHeadingText(headingText);

                return (
                  <h3
                    id={headingId}
                    className="group relative mt-6 mb-4 scroll-mt-24 text-xl font-semibold leading-[25px] text-neutral-900 dark:text-neutral-50"
                    {...props}
                  >
                    <a
                      href={`#${headingId}`}
                      aria-label={`Permalink: ${headingText}`}
                      className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus:opacity-100 focus:outline-none group-hover:opacity-100 sm:inline-flex dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <LinkIcon className="size-4" aria-hidden="true" />
                    </a>
                    {children}
                  </h3>
                );
              })()
            ),
            h4: ({ children, node, ...props }) => (
              (() => {
                const headingText = extractPlainText(children);
                const headingId =
                  headingIdsByLine.get(node?.position?.start.line ?? -1) ??
                  slugifyHeadingText(headingText);

                return (
                  <h4
                    id={headingId}
                    className="group relative mt-6 mb-4 scroll-mt-24 text-base font-semibold leading-6 text-neutral-900 dark:text-neutral-50"
                    {...props}
                  >
                    <a
                      href={`#${headingId}`}
                      aria-label={`Permalink: ${headingText}`}
                      className="absolute -left-6 top-1/2 hidden -translate-y-1/2 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 focus:opacity-100 focus:outline-none group-hover:opacity-100 sm:inline-flex dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <LinkIcon className="size-4" aria-hidden="true" />
                    </a>
                    {children}
                  </h4>
                );
              })()
            ),
            p: ({ children, ...props }) => (
              <p className="mb-4 leading-6" {...props}>
                {children}
              </p>
            ),
            // Handle links with wiki link navigation support
            a: ({ href, children, ...props }) => {
              const isExternal = href?.startsWith("http");
              const isWikiLink = href?.startsWith(WIKI_LINK_PREFIX);
              const isObsidian = href?.startsWith("obsidian://");
              const linkClassName = cn(
                "break-words text-blue-600 hover:text-blue-700 hover:underline hover:underline-offset-2 dark:text-blue-400 dark:hover:text-blue-300",
                props.className
              );

              // Handle wiki links for in-app navigation
              if (isWikiLink && href) {
                const targetPath = decodeURIComponent(
                  href.replace(WIKI_LINK_PREFIX, "")
                );
                // Strip .md extension for Obsidian links
                const targetWithoutExt = targetPath.replace(/\.md$/, "");
                const obsidianUrl = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(targetWithoutExt)}`;
                const webUrl =
                  typeof window !== "undefined"
                    ? `${window.location.pathname}?notePath=${encodeURIComponent(targetPath)}`
                    : `?notePath=${encodeURIComponent(targetPath)}`;

                const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
                  // Ctrl/Cmd+click opens in Obsidian
                  if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    window.open(obsidianUrl, "_self");
                    return;
                  }

                  // Regular click navigates in-app if handler is provided
                  if (onNavigateToNote) {
                    e.preventDefault();
                    onNavigateToNote(targetPath);
                  } else {
                    // Fallback to Obsidian if no navigation handler
                    e.preventDefault();
                    window.open(obsidianUrl, "_self");
                  }
                };

                return (
                  <a
                    href={onNavigateToNote ? webUrl : obsidianUrl}
                    onClick={handleClick}
                    title={onNavigateToNote ? "Click to view, Ctrl+click for Obsidian" : "Open in Obsidian"}
                    className={cn(linkClassName, "cursor-pointer")}
                    {...props}
                  >
                    {children}
                  </a>
                );
              }

              return (
                <a
                  href={href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  title={isObsidian ? "Open in Obsidian" : undefined}
                  className={linkClassName}
                  {...props}
                >
                  {children}
                </a>
              );
            },
            blockquote: ({ children, ...props }) => (
              <blockquote
                className="mb-4 border-l-4 border-neutral-300 px-4 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400 [&>p]:mb-0 [&>p+p]:mt-4"
                {...props}
              >
                {children}
              </blockquote>
            ),
            ul: ({ children, ...props }) => (
              <ul
                className={cn(
                  "mb-4 list-disc pl-8 [&_ol]:mb-0 [&_ol]:mt-2 [&_ul]:mb-0 [&_ul]:mt-2",
                  props.className?.includes("contains-task-list") &&
                    "list-none pl-0"
                )}
                {...props}
              >
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol
                className={cn(
                  "mb-4 list-decimal pl-8 [&_ol]:mb-0 [&_ol]:mt-2 [&_ul]:mb-0 [&_ul]:mt-2",
                  props.className?.includes("contains-task-list") &&
                    "list-none pl-0"
                )}
                {...props}
              >
                {children}
              </ol>
            ),
            li: ({ children, ...props }) => (
              <li
                className={cn(
                  "[&>p:last-child]:mb-0",
                  props.className?.includes("task-list-item") &&
                    "flex items-start gap-2 pl-0"
                )}
                {...props}
              >
                {children}
              </li>
            ),
            input: ({ type, checked, ...props }) => {
              if (type === "checkbox") {
                return (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled
                    readOnly
                    className="mt-1 size-4 shrink-0 rounded border-neutral-300 accent-neutral-700 dark:border-neutral-600 dark:bg-neutral-900 dark:accent-neutral-300"
                    {...props}
                  />
                );
              }

              return <input type={type} checked={checked} {...props} />;
            },
            // Lazy load images for better performance on large notes
            img: ({ src, alt, ...props }) => (
              <img
                src={src}
                alt={alt || ""}
                loading="lazy"
                className="mb-4 max-w-full rounded-md border border-neutral-200 dark:border-neutral-700"
                {...props}
              />
            ),
            // Handle code blocks - render Mermaid diagrams, style others
            code: ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || "");
              const language = match?.[1];
              const codeContent = String(children).replace(/\n$/, "");

              // Render Mermaid diagrams
              if (language === "mermaid") {
                return <MermaidDiagram chart={codeContent} className="my-4" />;
              }

              // Inline code (no language specified, not in a pre block)
              if (!className) {
                return (
                  <code
                    className="rounded-[6px] bg-neutral-200/70 px-[0.4em] py-[0.16em] font-mono text-[0.85em] leading-[1.5] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }

              // Code block with language
              return (
                <code
                  className={cn(
                    "font-mono text-[0.85rem] leading-[1.45] text-neutral-800 dark:text-neutral-100",
                    className
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            // Style pre blocks
            pre: ({ children, ...props }) => (
              <pre
                className="mb-4 overflow-x-auto rounded-[6px] bg-neutral-100 p-4 text-[0.85rem] leading-[1.45] text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                {...props}
              >
                {children}
              </pre>
            ),
            table: ({ children, ...props }) => (
              <div className="mb-4 overflow-x-auto">
                <table
                  className="w-full border-collapse text-left text-base [&_p:last-child]:mb-0"
                  {...props}
                >
                  {children}
                </table>
              </div>
            ),
            thead: ({ children, ...props }) => (
              <thead {...props}>
                {children}
              </thead>
            ),
            tr: ({ children, ...props }) => (
              <tr className="border-t border-neutral-300 dark:border-neutral-700" {...props}>
                {children}
              </tr>
            ),
            th: ({ children, ...props }) => (
              <th
                className="border border-neutral-300 px-[13px] py-1.5 text-left font-semibold text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
                {...props}
              >
                {children}
              </th>
            ),
            td: ({ children, ...props }) => (
              <td
                className="border border-neutral-300 px-[13px] py-1.5 align-top dark:border-neutral-700"
                {...props}
              >
                {children}
              </td>
            ),
            hr: (props) => (
              <hr
                className="my-6 h-1 border-0 bg-neutral-300 dark:bg-neutral-700"
                {...props}
              />
            ),
            strong: ({ children, ...props }) => (
              <strong className="font-semibold text-neutral-900 dark:text-neutral-100" {...props}>
                {children}
              </strong>
            ),
          }}
        >
          {displayContent}
        </ReactMarkdown>
      </article>

      {/* Show more/less toggle for large content */}
      {isLargeContent && (
        <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={toggleExpanded}
            className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="size-4" aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="size-4" aria-hidden="true" />
                Show full note ({Math.round(content.length / 1000)}KB)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
