export const WIKI_LINK_DATA_ATTR = "data-wiki-target";

function buildWikiLinkMarkdown(target: string, alias?: string): string {
  const displayText = alias && alias.length > 0 ? alias : target;
  return `[${displayText}](wiki://${WIKI_LINK_DATA_ATTR}/${encodeURIComponent(target)})`;
}

function transformWikiLinksOutsideInlineCode(content: string): string {
  let result = "";
  let index = 0;
  let activeInlineCodeFenceLength = 0;

  while (index < content.length) {
    if (content[index] === "`") {
      let tickCount = 1;

      while (content[index + tickCount] === "`") {
        tickCount += 1;
      }

      if (activeInlineCodeFenceLength === 0) {
        activeInlineCodeFenceLength = tickCount;
      } else if (activeInlineCodeFenceLength === tickCount) {
        activeInlineCodeFenceLength = 0;
      }

      result += content.slice(index, index + tickCount);
      index += tickCount;
      continue;
    }

    if (
      activeInlineCodeFenceLength === 0 &&
      content[index] === "[" &&
      content[index + 1] === "["
    ) {
      const closingIndex = content.indexOf("]]", index + 2);

      if (closingIndex !== -1) {
        const linkBody = content.slice(index + 2, closingIndex);
        const aliasSeparatorIndex = linkBody.indexOf("|");
        const rawTarget =
          aliasSeparatorIndex === -1
            ? linkBody
            : linkBody.slice(0, aliasSeparatorIndex);
        const rawAlias =
          aliasSeparatorIndex === -1
            ? undefined
            : linkBody.slice(aliasSeparatorIndex + 1);
        const target = rawTarget.trim();
        const alias = rawAlias?.trim();

        if (target.length > 0) {
          result += buildWikiLinkMarkdown(target, alias);
          index = closingIndex + 2;
          continue;
        }
      }
    }

    result += content[index];
    index += 1;
  }

  return result;
}

/**
 * Transform Obsidian-style wiki links [[note]] to regular markdown links.
 * Uses a special URL scheme to identify wiki links for in-app navigation.
 * Skips fenced code blocks and inline code so Mermaid/code examples stay intact.
 */
export function transformObsidianLinks(content: string): string {
  const lines = content.split("\n");
  let inFencedCodeBlock = false;
  let activeFenceMarker: "`" | "~" | null = null;
  let activeFenceLength = 0;

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

      if (fenceMatch) {
        const marker = fenceMatch[1];
        const markerChar = marker.startsWith("`") ? "`" : "~";

        if (!inFencedCodeBlock) {
          inFencedCodeBlock = true;
          activeFenceMarker = markerChar;
          activeFenceLength = marker.length;
          return line;
        }

        if (
          markerChar === activeFenceMarker &&
          marker.length >= activeFenceLength
        ) {
          inFencedCodeBlock = false;
          activeFenceMarker = null;
          activeFenceLength = 0;
          return line;
        }
      }

      if (inFencedCodeBlock) {
        return line;
      }

      return transformWikiLinksOutsideInlineCode(line);
    })
    .join("\n");
}
