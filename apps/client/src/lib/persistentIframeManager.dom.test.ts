// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

const stubBrowserGlobals = () => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverStub,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: () => undefined,
  });
};

const restoreBrowserGlobals = () => {
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: originalRequestAnimationFrame,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: originalCancelAnimationFrame,
  });
};

describe("persistentIframeManager focus eligibility", () => {
  let originalActiveElementDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalActiveElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "activeElement",
    );
    document.body.innerHTML = "";
    stubBrowserGlobals();
  });

  afterEach(async () => {
    const { persistentIframeManager } = await import("./persistentIframeManager");
    persistentIframeManager.clear();
    restoreBrowserGlobals();
    vi.restoreAllMocks();
    if (originalActiveElementDescriptor) {
      Object.defineProperty(document, "activeElement", originalActiveElementDescriptor);
    } else {
      Reflect.deleteProperty(document, "activeElement");
    }
  });

  it("blocks focus when iframe is not focus-eligible", async () => {
    const { persistentIframeManager } = await import("./persistentIframeManager");

    const iframe = persistentIframeManager.getOrCreateIframe("workspace", "https://example.com");
    const focusSpy = vi.spyOn(iframe, "focus");
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { focus: vi.fn() },
    });

    const target = document.createElement("div");
    target.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    });
    document.body.appendChild(target);

    const cleanup = persistentIframeManager.mountIframe("workspace", target);

    persistentIframeManager.setFocusEligible("workspace", false);

    expect(persistentIframeManager.canIframeReceiveFocus("workspace")).toBe(false);
    expect(persistentIframeManager.focusIframe("workspace")).toBe(false);
    expect(focusSpy).not.toHaveBeenCalled();

    cleanup();
  });

  it("moves focus away from an iframe when eligibility is revoked", async () => {
    const { persistentIframeManager } = await import("./persistentIframeManager");

    const iframe = persistentIframeManager.getOrCreateIframe("revoked", "https://example.com/revoked");
    let simulatedActiveElement: Element | null = iframe;
    const blurSpy = vi.spyOn(iframe, "blur").mockImplementation(() => {
      simulatedActiveElement = iframe;
    });
    const elementFocusSpy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function focus(this: HTMLElement) {
        if (
          this.getAttribute("aria-hidden") === "true" &&
          this.tabIndex === -1 &&
          this !== iframe
        ) {
          simulatedActiveElement = document.querySelector(
            "[aria-hidden='true'][tabindex='-1']"
          );
        }
      });

    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: () => simulatedActiveElement,
    });

    persistentIframeManager.setFocusEligible("revoked", false);

    const fallbackElement = document.querySelector("[aria-hidden='true'][tabindex='-1']");
    expect(blurSpy).toHaveBeenCalled();
    expect(elementFocusSpy).toHaveBeenCalled();
    expect(fallbackElement).not.toBeNull();
    expect(document.activeElement).toBe(fallbackElement);
  });

  it("blocks focus when iframe wrapper is hidden", async () => {
    const { persistentIframeManager } = await import("./persistentIframeManager");

    const iframe = persistentIframeManager.getOrCreateIframe("browser", "https://example.com/browser");
    const focusSpy = vi.spyOn(iframe, "focus");
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { focus: vi.fn() },
    });

    const target = document.createElement("div");
    target.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 120,
      height: 90,
      top: 0,
      left: 0,
      right: 120,
      bottom: 90,
      toJSON: () => ({}),
    });
    document.body.appendChild(target);

    persistentIframeManager.mountIframe("browser", target);
    persistentIframeManager.unmountIframe("browser");

    expect(persistentIframeManager.canIframeReceiveFocus("browser")).toBe(false);
    expect(persistentIframeManager.focusIframe("browser")).toBe(false);
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("does not re-show an iframe after unmounting before the mount frame runs", async () => {
    restoreBrowserGlobals();

    const rafCallbacks = new Map<number, FrameRequestCallback>();
    let nextRafId = 1;
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        const rafId = nextRafId++;
        rafCallbacks.set(rafId, callback);
        return rafId;
      },
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      value: (rafId: number) => {
        rafCallbacks.delete(rafId);
      },
    });

    const { persistentIframeManager } = await import("./persistentIframeManager");
    const iframe = persistentIframeManager.getOrCreateIframe(
      "pending-mount",
      "https://example.com/pending"
    );
    const wrapper = iframe.parentElement as HTMLDivElement;

    const target = document.createElement("div");
    target.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 120,
      height: 90,
      top: 0,
      left: 0,
      right: 120,
      bottom: 90,
      toJSON: () => ({}),
    });
    document.body.appendChild(target);

    const cleanup = persistentIframeManager.mountIframe("pending-mount", target);
    cleanup();

    for (const callback of rafCallbacks.values()) {
      callback(0);
    }

    expect(wrapper.style.visibility).toBe("hidden");
    expect(wrapper.style.pointerEvents).toBe("none");
    expect(persistentIframeManager.canIframeReceiveFocus("pending-mount")).toBe(false);

    stubBrowserGlobals();
  });

  it("focuses visible eligible iframes", async () => {
    const { persistentIframeManager } = await import("./persistentIframeManager");

    const iframe = persistentIframeManager.getOrCreateIframe("eligible", "https://example.com/eligible");
    const focusSpy = vi.spyOn(iframe, "focus");
    const contentWindowFocus = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { focus: contentWindowFocus },
    });

    const target = document.createElement("div");
    target.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 160,
      height: 120,
      top: 0,
      left: 0,
      right: 160,
      bottom: 120,
      toJSON: () => ({}),
    });
    document.body.appendChild(target);

    persistentIframeManager.mountIframe("eligible", target);

    expect(persistentIframeManager.canIframeReceiveFocus("eligible")).toBe(true);
    expect(persistentIframeManager.focusIframe("eligible")).toBe(true);
    expect(focusSpy).toHaveBeenCalled();
    expect(contentWindowFocus).toHaveBeenCalled();
  });
});
