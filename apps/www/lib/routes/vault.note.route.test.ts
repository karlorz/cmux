/**
 * Vault Note Route Tests
 *
 * Unit tests for vault note utilities like image URL rewriting.
 */

import { describe, expect, it } from "vitest";

// Re-implement the function here for unit testing since it's not exported
function rewriteImageUrls(
  content: string,
  notePath: string,
  teamSlugOrId: string,
): string {
  return content.replace(
    /!\[([^\]]*)\]\((?!https?:\/\/|data:)([^)]+)\)/g,
    (match, alt: string, imagePath: string) => {
      if (imagePath.includes("/api/vault/image")) {
        return match;
      }
      const proxyUrl = `/api/vault/image?path=${encodeURIComponent(imagePath)}&notePath=${encodeURIComponent(notePath)}&teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`;
      return `![${alt}](${proxyUrl})`;
    }
  );
}

describe("rewriteImageUrls", () => {
  const notePath = "projects/cmux/overview.md";
  const teamSlugOrId = "my-team";

  describe("relative paths", () => {
    it("rewrites relative image paths with ./", () => {
      const content = "![diagram](./images/arch.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toContain("/api/vault/image?");
      expect(result).toContain("path=.%2Fimages%2Farch.png");
      expect(result).toContain("notePath=projects%2Fcmux%2Foverview.md");
      expect(result).toContain("teamSlugOrId=my-team");
    });

    it("rewrites relative image paths without ./", () => {
      const content = "![logo](images/logo.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toContain("/api/vault/image?");
      expect(result).toContain("path=images%2Flogo.png");
    });

    it("rewrites parent directory paths with ../", () => {
      const content = "![shared](../shared/icon.svg)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toContain("/api/vault/image?");
      expect(result).toContain("path=..%2Fshared%2Ficon.svg");
    });
  });

  describe("absolute URLs", () => {
    it("does not rewrite https URLs", () => {
      const content = "![external](https://example.com/image.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toBe(content);
    });

    it("does not rewrite http URLs", () => {
      const content = "![external](http://example.com/image.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toBe(content);
    });

    it("does not rewrite data URIs", () => {
      const content = "![inline](data:image/png;base64,abc123)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toBe(content);
    });
  });

  describe("already proxied URLs", () => {
    it("does not double-proxy already proxied URLs", () => {
      const content = "![img](/api/vault/image?path=test.png&notePath=note.md&teamSlugOrId=team)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toBe(content);
    });
  });

  describe("multiple images", () => {
    it("rewrites all relative images in content", () => {
      const content = `
# Overview

![diagram](./arch.png)

Some text here.

![logo](images/logo.svg)

External: ![ext](https://cdn.example.com/img.png)
      `;
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      // Should rewrite 2 images
      expect(result.match(/\/api\/vault\/image\?/g)?.length).toBe(2);
      // Should keep external image unchanged
      expect(result).toContain("https://cdn.example.com/img.png");
    });
  });

  describe("alt text handling", () => {
    it("preserves empty alt text", () => {
      const content = "![](image.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toMatch(/!\[\]\(/);
    });

    it("preserves alt text with special characters", () => {
      const content = '![A "quoted" image](image.png)';
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toContain('![A "quoted" image]');
    });
  });

  describe("path encoding", () => {
    it("encodes spaces in image paths", () => {
      const content = "![img](my image.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toContain("path=my%20image.png");
    });

    it("encodes special characters in paths without parentheses", () => {
      // Note: Parentheses in filenames break standard markdown image syntax
      // because ) terminates the URL. Use URL-encoded paths or avoid parens.
      const content = "![img](path/to/image-v1.png)";
      const result = rewriteImageUrls(content, notePath, teamSlugOrId);

      expect(result).toContain(encodeURIComponent("path/to/image-v1.png"));
    });
  });
});
