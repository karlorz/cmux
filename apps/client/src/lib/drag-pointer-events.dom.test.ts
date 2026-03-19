/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  disableDragPointerEvents,
  restoreDragPointerEvents,
} from "./drag-pointer-events";

describe("drag-pointer-events", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe("disableDragPointerEvents", () => {
    it("disables pointer events on elements with data-drag-disable-pointer", () => {
      container.innerHTML = '<div data-drag-disable-pointer id="target"></div>';
      const target = document.getElementById("target") as HTMLElement;

      disableDragPointerEvents();

      expect(target.style.pointerEvents).toBe("none");
    });

    it("stores previous pointer-events value", () => {
      container.innerHTML =
        '<div data-drag-disable-pointer id="target" style="pointer-events: auto;"></div>';
      const target = document.getElementById("target") as HTMLElement;

      disableDragPointerEvents();

      expect(target.dataset.prevPointerEvents).toBe("auto");
    });

    it("stores __unset__ when no previous value", () => {
      container.innerHTML = '<div data-drag-disable-pointer id="target"></div>';
      const target = document.getElementById("target") as HTMLElement;

      disableDragPointerEvents();

      expect(target.dataset.prevPointerEvents).toBe("__unset__");
    });

    it("handles nested canvas elements", () => {
      container.innerHTML =
        '<div data-drag-disable-pointer><canvas id="canvas"></canvas></div>';
      const canvas = document.getElementById("canvas") as HTMLElement;

      disableDragPointerEvents();

      expect(canvas.style.pointerEvents).toBe("none");
    });

    it("handles nested iframe elements", () => {
      container.innerHTML =
        '<div data-drag-disable-pointer><iframe id="frame"></iframe></div>';
      const iframe = document.getElementById("frame") as HTMLElement;

      disableDragPointerEvents();

      expect(iframe.style.pointerEvents).toBe("none");
    });

    it("handles multiple elements", () => {
      container.innerHTML = `
        <div data-drag-disable-pointer id="a"></div>
        <div data-drag-disable-pointer id="b"></div>
      `;
      const a = document.getElementById("a") as HTMLElement;
      const b = document.getElementById("b") as HTMLElement;

      disableDragPointerEvents();

      expect(a.style.pointerEvents).toBe("none");
      expect(b.style.pointerEvents).toBe("none");
    });

    it("does not affect elements without attribute", () => {
      container.innerHTML = '<div id="other" style="pointer-events: auto;"></div>';
      const other = document.getElementById("other") as HTMLElement;

      disableDragPointerEvents();

      expect(other.style.pointerEvents).toBe("auto");
    });
  });

  describe("restoreDragPointerEvents", () => {
    it("restores original pointer-events value", () => {
      container.innerHTML =
        '<div data-drag-disable-pointer id="target" style="pointer-events: auto;"></div>';
      const target = document.getElementById("target") as HTMLElement;

      disableDragPointerEvents();
      restoreDragPointerEvents();

      expect(target.style.pointerEvents).toBe("auto");
    });

    it("removes pointer-events when originally unset", () => {
      container.innerHTML = '<div data-drag-disable-pointer id="target"></div>';
      const target = document.getElementById("target") as HTMLElement;

      disableDragPointerEvents();
      restoreDragPointerEvents();

      expect(target.style.pointerEvents).toBe("");
    });

    it("cleans up prevPointerEvents dataset", () => {
      container.innerHTML = '<div data-drag-disable-pointer id="target"></div>';
      const target = document.getElementById("target") as HTMLElement;

      disableDragPointerEvents();
      expect(target.dataset.prevPointerEvents).toBeDefined();

      restoreDragPointerEvents();
      expect(target.dataset.prevPointerEvents).toBeUndefined();
    });

    it("handles elements without prevPointerEvents dataset", () => {
      container.innerHTML = '<div data-drag-disable-pointer id="target" style="pointer-events: none;"></div>';
      const target = document.getElementById("target") as HTMLElement;

      // Call restore without disable first
      restoreDragPointerEvents();

      // Should remove pointer-events
      expect(target.style.pointerEvents).toBe("");
    });

    it("restores multiple elements", () => {
      container.innerHTML = `
        <div data-drag-disable-pointer id="a" style="pointer-events: all;"></div>
        <div data-drag-disable-pointer id="b" style="pointer-events: auto;"></div>
      `;
      const a = document.getElementById("a") as HTMLElement;
      const b = document.getElementById("b") as HTMLElement;

      disableDragPointerEvents();
      restoreDragPointerEvents();

      expect(a.style.pointerEvents).toBe("all");
      expect(b.style.pointerEvents).toBe("auto");
    });
  });
});
