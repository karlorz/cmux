// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { isInteractiveFocusRetentionElement } from "./iframeFocusGuard";

describe("isInteractiveFocusRetentionElement", () => {
  it("returns true for interactive controls that should keep focus", () => {
    expect(isInteractiveFocusRetentionElement(document.createElement("input"))).toBe(true);
    expect(isInteractiveFocusRetentionElement(document.createElement("textarea"))).toBe(true);
    expect(isInteractiveFocusRetentionElement(document.createElement("button"))).toBe(true);
    expect(isInteractiveFocusRetentionElement(document.createElement("select"))).toBe(true);

    const linkedAnchor = document.createElement("a");
    linkedAnchor.href = "https://example.com";
    expect(isInteractiveFocusRetentionElement(linkedAnchor)).toBe(true);

    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", {
      configurable: true,
      value: true,
    });
    expect(isInteractiveFocusRetentionElement(editable)).toBe(true);

    const roleButtonDiv = document.createElement("div");
    roleButtonDiv.setAttribute("role", "button");
    roleButtonDiv.tabIndex = 0;
    expect(isInteractiveFocusRetentionElement(roleButtonDiv)).toBe(true);

    const focusableSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    focusableSvg.setAttribute("tabindex", "0");
    expect(isInteractiveFocusRetentionElement(focusableSvg)).toBe(true);
  });

  it("returns false for non-interactive elements", () => {
    expect(isInteractiveFocusRetentionElement(document.createElement("div"))).toBe(false);

    const inertAnchor = document.createElement("a");
    expect(isInteractiveFocusRetentionElement(inertAnchor)).toBe(false);

    const focusTrapDiv = document.createElement("div");
    focusTrapDiv.setAttribute("tabindex", "-1");
    expect(isInteractiveFocusRetentionElement(focusTrapDiv)).toBe(false);

    const ariaHiddenButton = document.createElement("button");
    ariaHiddenButton.setAttribute("aria-hidden", "true");
    expect(isInteractiveFocusRetentionElement(ariaHiddenButton)).toBe(false);

    expect(isInteractiveFocusRetentionElement(document.createElement("iframe"))).toBe(false);
    expect(isInteractiveFocusRetentionElement(document.body)).toBe(false);
    expect(isInteractiveFocusRetentionElement(document.documentElement)).toBe(false);
    expect(isInteractiveFocusRetentionElement(null)).toBe(false);
  });
});
