import { describe, expect, it } from "vitest";
import { isAllowedBaseUrl } from "./settings.helpers";

describe("settings.helpers", () => {
  describe("isAllowedBaseUrl", () => {
    describe("valid URLs", () => {
      it("allows valid HTTPS URLs", () => {
        expect(isAllowedBaseUrl("https://api.example.com")).toEqual({ allowed: true });
        expect(isAllowedBaseUrl("https://example.com/path")).toEqual({ allowed: true });
        expect(isAllowedBaseUrl("https://sub.domain.example.com")).toEqual({ allowed: true });
      });

      it("allows HTTPS URLs with ports", () => {
        expect(isAllowedBaseUrl("https://api.example.com:8443")).toEqual({ allowed: true });
      });

      it("allows HTTPS URLs with paths and query strings", () => {
        expect(isAllowedBaseUrl("https://api.example.com/v1/endpoint?key=value")).toEqual({ allowed: true });
      });
    });

    describe("invalid URL format", () => {
      it("rejects invalid URL format", () => {
        const result = isAllowedBaseUrl("not-a-url");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });

      it("rejects empty string", () => {
        const result = isAllowedBaseUrl("");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });

      it("rejects malformed URLs", () => {
        const result = isAllowedBaseUrl("://missing-protocol");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });
    });

    describe("protocol restrictions", () => {
      it("rejects HTTP URLs", () => {
        const result = isAllowedBaseUrl("http://example.com");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Only HTTPS URLs are allowed");
      });

      it("rejects FTP URLs", () => {
        const result = isAllowedBaseUrl("ftp://example.com");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Only HTTPS URLs are allowed");
      });

      it("rejects file URLs", () => {
        const result = isAllowedBaseUrl("file:///etc/passwd");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Only HTTPS URLs are allowed");
      });
    });

    describe("localhost restrictions", () => {
      it("rejects localhost", () => {
        const result = isAllowedBaseUrl("https://localhost");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });

      it("rejects localhost with port", () => {
        const result = isAllowedBaseUrl("https://localhost:3000");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });

      it("rejects 127.0.0.1", () => {
        const result = isAllowedBaseUrl("https://127.0.0.1");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });

      it("rejects ::1 IPv6 loopback (invalid URL without brackets)", () => {
        // Note: ::1 without brackets is not a valid URL, use [::1]
        const result = isAllowedBaseUrl("https://::1");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });

      it("rejects [::1] bracketed IPv6 loopback", () => {
        const result = isAllowedBaseUrl("https://[::1]");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });
    });

    describe("metadata endpoint restrictions", () => {
      it("rejects AWS metadata endpoint", () => {
        const result = isAllowedBaseUrl("https://169.254.169.254");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Metadata endpoints are not allowed");
      });

      it("rejects GCP metadata endpoint", () => {
        const result = isAllowedBaseUrl("https://metadata.google.internal");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Metadata endpoints are not allowed");
      });
    });

    describe("private IPv4 ranges", () => {
      it("rejects 10.x.x.x range", () => {
        const result = isAllowedBaseUrl("https://10.0.0.1");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IP ranges are not allowed");
      });

      it("rejects 10.255.255.255", () => {
        const result = isAllowedBaseUrl("https://10.255.255.255");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IP ranges are not allowed");
      });

      it("rejects 172.16.x.x range", () => {
        const result = isAllowedBaseUrl("https://172.16.0.1");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IP ranges are not allowed");
      });

      it("rejects 172.31.x.x range", () => {
        const result = isAllowedBaseUrl("https://172.31.255.255");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IP ranges are not allowed");
      });

      it("allows 172.15.x.x (not in private range)", () => {
        const result = isAllowedBaseUrl("https://172.15.0.1");
        expect(result.allowed).toBe(true);
      });

      it("allows 172.32.x.x (not in private range)", () => {
        const result = isAllowedBaseUrl("https://172.32.0.1");
        expect(result.allowed).toBe(true);
      });

      it("rejects 192.168.x.x range", () => {
        const result = isAllowedBaseUrl("https://192.168.0.1");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IP ranges are not allowed");
      });

      it("rejects 192.168.255.255", () => {
        const result = isAllowedBaseUrl("https://192.168.255.255");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IP ranges are not allowed");
      });
    });

    describe("link-local addresses", () => {
      it("rejects 169.254.x.x range", () => {
        const result = isAllowedBaseUrl("https://169.254.1.1");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Link-local addresses are not allowed");
      });
    });

    describe("loopback addresses", () => {
      it("rejects 127.x.x.x range", () => {
        const result = isAllowedBaseUrl("https://127.0.0.2");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("rejects 127.255.255.255", () => {
        const result = isAllowedBaseUrl("https://127.255.255.255");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });
    });

    describe("IPv6 restrictions", () => {
      it("rejects [::1] loopback with port (caught by localhost check)", () => {
        const result = isAllowedBaseUrl("https://[::1]:8080");
        expect(result.allowed).toBe(false);
        // The [::1] check happens before IPv6 parsing
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });

      it("rejects fc00::/7 private addresses", () => {
        const result = isAllowedBaseUrl("https://[fc00::1]");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IPv6 addresses are not allowed");
      });

      it("rejects fd00::/8 private addresses", () => {
        const result = isAllowedBaseUrl("https://[fd12:3456::1]");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Private IPv6 addresses are not allowed");
      });

      it("rejects fe80::/10 link-local addresses", () => {
        const result = isAllowedBaseUrl("https://[fe80::1]");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Link-local IPv6 addresses are not allowed");
      });

      it("rejects :: unspecified address", () => {
        const result = isAllowedBaseUrl("https://[::]");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Unspecified address is not allowed");
      });

      it("rejects ::ffff: IPv4-mapped addresses", () => {
        const result = isAllowedBaseUrl("https://[::ffff:192.168.1.1]");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("IPv4-mapped IPv6 addresses are not allowed");
      });

      it("allows valid public IPv6 addresses", () => {
        const result = isAllowedBaseUrl("https://[2001:db8::1]");
        expect(result.allowed).toBe(true);
      });
    });

    describe("case sensitivity", () => {
      it("handles uppercase hostnames", () => {
        const result = isAllowedBaseUrl("https://LOCALHOST");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });

      it("handles mixed case hostnames", () => {
        const result = isAllowedBaseUrl("https://LocalHost");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Localhost URLs are not allowed");
      });

      it("handles uppercase metadata hostname", () => {
        const result = isAllowedBaseUrl("https://METADATA.GOOGLE.INTERNAL");
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("Metadata endpoints are not allowed");
      });
    });
  });
});
