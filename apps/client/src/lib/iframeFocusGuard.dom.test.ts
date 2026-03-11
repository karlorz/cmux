// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearFocusedIframeBeforeBlur,
  ensureIframeFocusGuard,
  getWindowHasFocus,
  resetIframeFocusGuardForTests,
  setIframeFocusAllowedChecker,
} from "./iframeFocusGuard";

describe("iframeFocusGuard", () => {
  let originalActiveElementDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalActiveElementDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "activeElement",
    );
    document.body.innerHTML = "";
    resetIframeFocusGuardForTests();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetIframeFocusGuardForTests();
    if (originalActiveElementDescriptor) {
      Object.defineProperty(document, "activeElement", originalActiveElementDescriptor);
    } else {
      Reflect.deleteProperty(document, "activeElement");
    }
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

  it("falls back to a hidden focus target when previous focus cannot be restored", () => {
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

    let simulatedActiveElement: Element | null = iframe;
    const focusSpy = vi.spyOn(iframe, "blur").mockImplementation(() => {
      simulatedActiveElement = iframe;
    });
    const elementFocusSpy = vi
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function focus(this: HTMLElement) {
        if (this.id === "cmux-iframe-focus-guard-fallback") {
          simulatedActiveElement = document.querySelector(
            "#cmux-iframe-focus-guard-fallback"
          );
        }
      });

    setIframeFocusAllowedChecker(() => false);
    ensureIframeFocusGuard();

    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: () => simulatedActiveElement,
    });

    iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    const fallbackElement = document.querySelector("#cmux-iframe-focus-guard-fallback");
    expect(focusSpy).toHaveBeenCalled();
    expect(elementFocusSpy).toHaveBeenCalled();
    expect(fallbackElement).not.toBeNull();
    expect(document.activeElement).toBe(fallbackElement);
  });

  it("captures iframe focus ownership on window blur and restores on refocus", async () => {
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

    // Make iframe focus-eligible
    setIframeFocusAllowedChecker(() => true);
    ensureIframeFocusGuard();

    // Simulate iframe having focus
    let simulatedActiveElement: Element | null = iframe;
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: () => simulatedActiveElement,
    });

    const iframeFocusSpy = vi.spyOn(iframe, "focus").mockImplementation(() => {
      simulatedActiveElement = iframe;
    });

    // Window blur should capture iframe focus ownership
    expect(getWindowHasFocus()).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(getWindowHasFocus()).toBe(false);

    // Simulate focus moving to body during blur (browser behavior)
    simulatedActiveElement = document.body;

    // Window focus should restore iframe focus
    window.dispatchEvent(new Event("focus"));
    expect(getWindowHasFocus()).toBe(true);

    // Wait for requestAnimationFrame
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(iframeFocusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("does not restore iframe focus if user clicked elsewhere during refocus", async () => {
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

    const button = document.createElement("button");
    document.body.appendChild(button);

    setIframeFocusAllowedChecker(() => true);
    ensureIframeFocusGuard();

    // Simulate iframe having focus
    let simulatedActiveElement: Element | null = iframe;
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: () => simulatedActiveElement,
    });

    const iframeFocusSpy = vi.spyOn(iframe, "focus");

    // Window blur captures iframe
    window.dispatchEvent(new Event("blur"));

    // User clicks button during refocus
    simulatedActiveElement = button;

    // Window focus
    window.dispatchEvent(new Event("focus"));

    // Wait for requestAnimationFrame
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Should NOT restore iframe focus because button is interactive
    expect(iframeFocusSpy).not.toHaveBeenCalled();
  });

  it("clears focus ownership when clearFocusedIframeBeforeBlur is called", async () => {
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

    setIframeFocusAllowedChecker(() => true);
    ensureIframeFocusGuard();

    Object.defineProperty(document, "activeElement", {
      configurable: true,
      get: () => iframe,
    });

    const iframeFocusSpy = vi.spyOn(iframe, "focus");

    // Window blur captures iframe
    window.dispatchEvent(new Event("blur"));

    // Explicitly clear the stored focus
    clearFocusedIframeBeforeBlur();

    // Window focus
    window.dispatchEvent(new Event("focus"));

    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Should NOT restore because we cleared ownership
    expect(iframeFocusSpy).not.toHaveBeenCalled();
  });
});
