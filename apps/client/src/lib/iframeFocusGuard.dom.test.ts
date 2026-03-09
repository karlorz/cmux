// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureIframeFocusGuard,
  resetIframeFocusGuardForTests,
  setIframeFocusAllowedChecker,
} from "./iframeFocusGuard";

describe("iframeFocusGuard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetIframeFocusGuardForTests();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 });
  });

  afterEach(() => {
    resetIframeFocusGuardForTests();
  });

  it("restores previous focus when a visible iframe is not focus-eligible", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    const restoreSpy = vi.spyOn(button, "focus");

    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "getClientRects", {
      configurable: true,
      value: () => [{ width: 200, height: 100 }],
    });
    iframe.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    });
    document.body.appendChild(iframe);

    setIframeFocusAllowedChecker(() => false);
    ensureIframeFocusGuard();

    iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(restoreSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(button);
  });
});
