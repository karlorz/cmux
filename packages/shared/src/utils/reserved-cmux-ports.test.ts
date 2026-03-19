import { describe, expect, it } from "vitest";
import {
  RESERVED_CMUX_PORTS,
  RESERVED_CMUX_PORT_SET,
} from "./reserved-cmux-ports";

describe("RESERVED_CMUX_PORTS", () => {
  it("is a non-empty array", () => {
    expect(RESERVED_CMUX_PORTS).toBeInstanceOf(Array);
    expect(RESERVED_CMUX_PORTS.length).toBeGreaterThan(0);
  });

  it("contains only numbers", () => {
    for (const port of RESERVED_CMUX_PORTS) {
      expect(typeof port).toBe("number");
    }
  });

  it("contains ports in valid range (1-65535)", () => {
    for (const port of RESERVED_CMUX_PORTS) {
      expect(port).toBeGreaterThanOrEqual(1);
      expect(port).toBeLessThanOrEqual(65535);
    }
  });

  it("contains expected reserved ports", () => {
    expect(RESERVED_CMUX_PORTS).toContain(39375);
    expect(RESERVED_CMUX_PORTS).toContain(39378);
  });

  it("has no duplicate entries", () => {
    const uniquePorts = new Set(RESERVED_CMUX_PORTS);
    expect(uniquePorts.size).toBe(RESERVED_CMUX_PORTS.length);
  });
});

describe("RESERVED_CMUX_PORT_SET", () => {
  it("is a Set", () => {
    expect(RESERVED_CMUX_PORT_SET).toBeInstanceOf(Set);
  });

  it("has same size as RESERVED_CMUX_PORTS array", () => {
    expect(RESERVED_CMUX_PORT_SET.size).toBe(RESERVED_CMUX_PORTS.length);
  });

  it("contains all ports from the array", () => {
    for (const port of RESERVED_CMUX_PORTS) {
      expect(RESERVED_CMUX_PORT_SET.has(port)).toBe(true);
    }
  });

  it("can check port membership efficiently", () => {
    expect(RESERVED_CMUX_PORT_SET.has(39375)).toBe(true);
    expect(RESERVED_CMUX_PORT_SET.has(8080)).toBe(false);
    expect(RESERVED_CMUX_PORT_SET.has(3000)).toBe(false);
  });
});
