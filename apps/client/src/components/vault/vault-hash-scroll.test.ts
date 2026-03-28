// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { scrollContainerToHashTarget } from "./vault-hash-scroll";

describe("scrollContainerToHashTarget", () => {
  it("scrolls the preview container to the hashed heading", () => {
    const container = document.createElement("div");
    const target = document.createElement("h2");
    target.id = "external-links";
    container.append(target);

    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });

    container.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 100,
      left: 0,
      right: 800,
      bottom: 900,
      width: 800,
      height: 800,
      toJSON: () => null,
    }));

    target.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 460,
      left: 0,
      right: 400,
      bottom: 500,
      width: 400,
      height: 40,
      toJSON: () => null,
    }));

    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    const didScroll = scrollContainerToHashTarget({
      container,
      hash: "#external-links",
    });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 656,
      behavior: "auto",
    });
  });

  it("does nothing when the hash target is missing", () => {
    const container = document.createElement("div");
    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    const didScroll = scrollContainerToHashTarget({
      container,
      hash: "#missing-heading",
    });

    expect(didScroll).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("decodes hashed ids before searching the preview container", () => {
    const container = document.createElement("div");
    const target = document.createElement("h2");
    target.id = "roadmaps--planning";
    container.append(target);

    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      value: 0,
      writable: true,
    });

    container.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 600,
      bottom: 600,
      width: 600,
      height: 600,
      toJSON: () => null,
    }));

    target.getBoundingClientRect = vi.fn(() => ({
      x: 0,
      y: 0,
      top: 18,
      left: 0,
      right: 200,
      bottom: 58,
      width: 200,
      height: 40,
      toJSON: () => null,
    }));

    const scrollTo = vi.fn();
    container.scrollTo = scrollTo;

    const didScroll = scrollContainerToHashTarget({
      container,
      hash: "#roadmaps--planning",
    });

    expect(didScroll).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "auto",
    });
  });
});
