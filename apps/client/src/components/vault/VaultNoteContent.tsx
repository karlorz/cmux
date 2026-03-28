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

import { useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { MermaidDiagram } from "@/components/mermaid-diagram";

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

// Data attribute used to identify wiki links for navigation
const WIKI_LINK_DATA_ATTR = "data-wiki-target";

/**
 * Transform Obsidian-style wiki links [[note]] to regular markdown links.
 * Uses a special URL scheme to identify wiki links for in-app navigation.
 * The vaultName parameter is kept for future use but the actual Obsidian URL
 * is constructed in the link click handler.
 */
function transformObsidianLinks(content: string, _vaultName: string): string {
  // Transform [[note]] to a special wiki:// URL for in-app handling
  // Transform [[note|alias]] uses alias as display text
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, target: string, alias?: string) => {
      const displayText = alias || target;
      // Use a special URL scheme to identify wiki links for in-app navigation
      return `[${displayText}](wiki://${WIKI_LINK_DATA_ATTR}/${encodeURIComponent(target)})`;
    }
  );
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
    return transformObsidianLinks(rawContent, vaultName);
  }, [content, isLargeContent, isExpanded, maxLength, vaultName]);

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
        className={`text-[14px] text-neutral-700 dark:text-neutral-300
          prose prose-neutral dark:prose-invert prose-sm max-w-none
          prose-p:my-1.5 prose-p:leading-relaxed
          prose-headings:mt-4 prose-headings:mb-3 prose-headings:font-semibold
          prose-h1:text-xl prose-h1:mt-5 prose-h1:mb-3
          prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2.5
          prose-h3:text-base prose-h3:mt-3.5 prose-h3:mb-2
          prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5
          prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5
          prose-li:my-0.5
          prose-blockquote:border-l-4 prose-blockquote:border-neutral-300 dark:prose-blockquote:border-neutral-600
          prose-blockquote:pl-4 prose-blockquote:py-0.5 prose-blockquote:my-2
          prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:bg-neutral-200 dark:prose-code:bg-neutral-700
          prose-code:text-[13px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-neutral-900 dark:prose-pre:bg-neutral-800 prose-pre:text-neutral-100
          prose-pre:p-3 prose-pre:rounded-md prose-pre:my-2 prose-pre:overflow-x-auto
          prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline prose-a:break-words
          prose-table:my-2 prose-table:border prose-table:border-neutral-300 dark:prose-table:border-neutral-600
          prose-th:p-2 prose-th:bg-neutral-100 dark:prose-th:bg-neutral-800
          prose-td:p-2 prose-td:border prose-td:border-neutral-300 dark:prose-td:border-neutral-600
          prose-hr:my-3 prose-hr:border-neutral-300 dark:prose-hr:border-neutral-600
          prose-strong:font-semibold prose-strong:text-neutral-900 dark:prose-strong:text-neutral-100
          prose-img:rounded-md prose-img:max-w-full`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Handle links with wiki link navigation support
            a: ({ href, children, ...props }) => {
              const isExternal = href?.startsWith("http");
              const isWikiLink = href?.startsWith("wiki://");
              const isObsidian = href?.startsWith("obsidian://");

              // Handle wiki links for in-app navigation
              if (isWikiLink && href) {
                const targetPath = decodeURIComponent(
                  href.replace(`wiki://${WIKI_LINK_DATA_ATTR}/`, "")
                );
                // Strip .md extension for Obsidian links
                const targetWithoutExt = targetPath.replace(/\.md$/, "");
                const obsidianUrl = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(targetWithoutExt)}`;

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
                    href={obsidianUrl}
                    onClick={handleClick}
                    title={onNavigateToNote ? "Click to view, Ctrl+click for Obsidian" : "Open in Obsidian"}
                    className="cursor-pointer"
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
                  {...props}
                >
                  {children}
                </a>
              );
            },
            // Lazy load images for better performance on large notes
            img: ({ src, alt, ...props }) => (
              <img
                src={src}
                alt={alt || ""}
                loading="lazy"
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
                return <code {...props}>{children}</code>;
              }

              // Code block with language
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            // Style pre blocks
            pre: ({ children, ...props }) => (
              <pre className="relative group" {...props}>
                {children}
              </pre>
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
