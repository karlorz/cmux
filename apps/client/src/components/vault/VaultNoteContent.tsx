/**
 * VaultNoteContent Component
 *
 * Renders markdown content from an Obsidian vault note.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface VaultNoteContentProps {
  content: string;
  className?: string;
}

export function VaultNoteContent({ content, className }: VaultNoteContentProps) {
  return (
    <div
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
        ${className ?? ""}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
