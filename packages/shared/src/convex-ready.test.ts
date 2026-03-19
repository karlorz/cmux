import { describe, expect, it, vi } from "vitest";

// Import fresh module for each test
describe("convex-ready", () => {
  it("emitConvexReady resolves pending onConvexReady promises", async () => {
    // Dynamic import to get fresh module state
    vi.resetModules();
    const { onConvexReady, emitConvexReady } = await import("./convex-ready");

    let resolved = false;
    const promise = onConvexReady().then((result) => {
      resolved = true;
      return result;
    });

    // Not resolved yet
    expect(resolved).toBe(false);

    // Emit ready signal
    emitConvexReady();

    // Now it should resolve
    const result = await promise;
    expect(result).toBe(true);
    expect(resolved).toBe(true);
  });

  it("multiple listeners are all notified", async () => {
    vi.resetModules();
    const { onConvexReady, emitConvexReady } = await import("./convex-ready");

    const results: boolean[] = [];

    const p1 = onConvexReady().then((r) => {
      results.push(r);
      return r;
    });
    const p2 = onConvexReady().then((r) => {
      results.push(r);
      return r;
    });
    const p3 = onConvexReady().then((r) => {
      results.push(r);
      return r;
    });

    emitConvexReady();

    await Promise.all([p1, p2, p3]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r === true)).toBe(true);
  });

  it("onConvexReady returns a promise", async () => {
    vi.resetModules();
    const { onConvexReady } = await import("./convex-ready");

    const result = onConvexReady();
    expect(result).toBeInstanceOf(Promise);
  });
});
