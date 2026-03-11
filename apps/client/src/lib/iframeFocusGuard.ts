let focusGuardInitialized = false;
let lastActiveElement: Element | null = null;
let iframeFocusAllowedChecker: (iframe: HTMLIFrameElement) => boolean = () => true;
let focusInHandler: ((event: FocusEvent) => void) | null = null;
let windowBlurHandler: (() => void) | null = null;
let windowFocusHandler: (() => void) | null = null;
let focusGuardFallbackElement: HTMLDivElement | null = null;
/**
 * Tracks which iframe had focus before window blur.
 * This is captured proactively on blur (before activeElement changes)
 * so we can restore focus correctly on window refocus.
 */
let focusedIframeBeforeBlur: HTMLIFrameElement | null = null;
let windowHasFocus = typeof document !== "undefined" ? document.hasFocus() : true;
const FOCUS_GUARD_FALLBACK_ID = "cmux-iframe-focus-guard-fallback";
const PERSISTENT_IFRAME_CONTAINER_ID = "persistent-iframe-container";
const INTERACTIVE_FOCUS_RETENTION_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "gridcell",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);

function isHiddenFromAssistiveTech(element: HTMLElement | SVGElement): boolean {
  return element.getAttribute("aria-hidden") === "true";
}

function isElementVisibleForFocusRetention(element: Element): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return true;
  }

  if (element instanceof HTMLElement) {
    if (element.hidden || element.inert || isHiddenFromAssistiveTech(element)) {
      return false;
    }
  }

  if (element instanceof SVGElement && isHiddenFromAssistiveTech(element)) {
    return false;
  }

  return !element.isConnected || hasVisibleAncestors(element);
}

export const isInteractiveFocusRetentionElement = (
  element: Element | null
): boolean => {
  if (
    !element ||
    element instanceof HTMLIFrameElement ||
    element === document.body ||
    element === document.documentElement ||
    (element instanceof HTMLElement && element.id === FOCUS_GUARD_FALLBACK_ID)
  ) {
    return false;
  }

  if (!isElementVisibleForFocusRetention(element)) {
    return false;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (element instanceof HTMLAnchorElement) {
    return element.hasAttribute("href") || element.hasAttribute("tabindex");
  }

  if (element instanceof HTMLAudioElement || element instanceof HTMLVideoElement) {
    return element.controls;
  }

  if (element instanceof HTMLElement) {
    if (element.isContentEditable || element.tabIndex >= 0) {
      return true;
    }

    const role = element.getAttribute("role");
    return role !== null && INTERACTIVE_FOCUS_RETENTION_ROLES.has(role);
  }

  if (element instanceof SVGElement) {
    return element.tabIndex >= 0 || element.hasAttribute("tabindex");
  }

  return false;
};

const isFocusableElement = (
  element: Element | null
): element is HTMLElement | SVGElement => {
  return Boolean(
    element &&
      "focus" in element &&
      typeof (element as HTMLElement | SVGElement).focus === "function"
  );
};

const hasVisibleAncestors = (element: Element): boolean => {
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    if (current instanceof HTMLElement) {
      const style = window.getComputedStyle(current);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        (style.pointerEvents === "none" &&
          current.id !== PERSISTENT_IFRAME_CONTAINER_ID)
      ) {
        return false;
      }
    }

    current = current.parentElement;
  }

  return true;
};

const isIframeVisibleOnScreen = (iframe: HTMLIFrameElement): boolean => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return true;
  }

  if (!iframe.isConnected) {
    return false;
  }

  const style = window.getComputedStyle(iframe);
  if (
    style.visibility === "hidden" ||
    style.display === "none" ||
    style.pointerEvents === "none"
  ) {
    return false;
  }

  if (!hasVisibleAncestors(iframe)) {
    return false;
  }

  if (iframe.getClientRects().length === 0) {
    return false;
  }

  const rect = iframe.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;

  const horizontallyVisible = rect.right > 0 && rect.left < viewportWidth;
  const verticallyVisible = rect.bottom > 0 && rect.top < viewportHeight;

  return horizontallyVisible && verticallyVisible;
};

export const setIframeFocusAllowedChecker = (
  checker: (iframe: HTMLIFrameElement) => boolean
): void => {
  iframeFocusAllowedChecker = checker;
};

export const getFocusGuardFallbackElement = (): HTMLDivElement | null => {
  if (typeof document === "undefined") {
    return null;
  }

  if (focusGuardFallbackElement?.isConnected) {
    return focusGuardFallbackElement;
  }

  const existing = document.getElementById(FOCUS_GUARD_FALLBACK_ID);
  if (existing instanceof HTMLDivElement) {
    focusGuardFallbackElement = existing;
    return existing;
  }

  if (!document.body) {
    return null;
  }

  const fallback = document.createElement("div");
  fallback.id = FOCUS_GUARD_FALLBACK_ID;
  fallback.tabIndex = -1;
  fallback.setAttribute("aria-hidden", "true");
  fallback.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;top:0;left:0;";
  document.body.appendChild(fallback);
  focusGuardFallbackElement = fallback;
  return fallback;
};

const isSafeFocusRestoreTarget = (
  element: Element | null
): element is HTMLElement | SVGElement | HTMLIFrameElement => {
  if (!isFocusableElement(element) || !element.isConnected) {
    return false;
  }

  if (element instanceof HTMLIFrameElement) {
    return iframeFocusAllowedChecker(element) && isIframeVisibleOnScreen(element);
  }

  return isInteractiveFocusRetentionElement(element);
};

export const restoreFocusFromIframe = (
  iframe: HTMLIFrameElement,
  previousElement: Element | null
): Element | null => {
  if (isSafeFocusRestoreTarget(previousElement)) {
    try {
      previousElement.focus({ preventScroll: true });
    } catch (error) {
      console.error(
        "Failed to restore focus after blocked iframe focus attempt",
        error
      );
    }
  }

  if (document.activeElement === iframe) {
    try {
      iframe.blur();
    } catch (error) {
      console.error("Failed to blur blocked iframe focus attempt", error);
    }
  }

  if (document.activeElement === iframe) {
    const fallbackElement = getFocusGuardFallbackElement();
    if (fallbackElement) {
      try {
        fallbackElement.focus({ preventScroll: true });
      } catch (error) {
        console.error("Failed to focus iframe guard fallback element", error);
      }
    }
  }

  const activeElement = document.activeElement;
  return activeElement instanceof Element ? activeElement : previousElement ?? null;
};

export const ensureIframeFocusGuard = (): void => {
  if (focusGuardInitialized || typeof document === "undefined") {
    return;
  }

  focusGuardInitialized = true;
  lastActiveElement = document.activeElement;
  windowHasFocus = document.hasFocus();

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target instanceof HTMLIFrameElement) {
      const previousElement = lastActiveElement;
      const shouldBlockFocus =
        !iframeFocusAllowedChecker(target) || !isIframeVisibleOnScreen(target);

      if (shouldBlockFocus) {
        lastActiveElement = restoreFocusFromIframe(target, previousElement);
        return;
      }

      lastActiveElement = target;
      return;
    }

    lastActiveElement = target;
  };

  /**
   * Capture iframe focus ownership BEFORE the window loses focus.
   * This is critical because once the window blurs, document.activeElement
   * may have already changed (especially for cross-origin iframes).
   */
  const handleWindowBlur = () => {
    windowHasFocus = false;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLIFrameElement) {
      // Only remember if the iframe is focus-eligible
      if (iframeFocusAllowedChecker(activeElement) && isIframeVisibleOnScreen(activeElement)) {
        focusedIframeBeforeBlur = activeElement;
      } else {
        focusedIframeBeforeBlur = null;
      }
    } else {
      focusedIframeBeforeBlur = null;
    }
  };

  /**
   * On window refocus, restore focus to the iframe that had it before blur,
   * but only if it's still eligible for focus.
   */
  const handleWindowFocus = () => {
    windowHasFocus = true;
    const iframeToRestore = focusedIframeBeforeBlur;
    focusedIframeBeforeBlur = null;

    if (!iframeToRestore || !iframeToRestore.isConnected) {
      return;
    }

    // Check if the iframe is still eligible for focus
    if (!iframeFocusAllowedChecker(iframeToRestore) || !isIframeVisibleOnScreen(iframeToRestore)) {
      return;
    }

    // Check if user has clicked on something else during refocus
    const currentActive = document.activeElement;
    if (isInteractiveFocusRetentionElement(currentActive)) {
      return;
    }

    // Use a short delay to let the browser settle focus state
    requestAnimationFrame(() => {
      // Re-check conditions after the frame
      if (!iframeToRestore.isConnected) {
        return;
      }
      if (!iframeFocusAllowedChecker(iframeToRestore) || !isIframeVisibleOnScreen(iframeToRestore)) {
        return;
      }
      const stillCurrentActive = document.activeElement;
      if (isInteractiveFocusRetentionElement(stillCurrentActive)) {
        return;
      }

      try {
        iframeToRestore.focus({ preventScroll: true });
        lastActiveElement = iframeToRestore;
      } catch (error) {
        console.error("Failed to restore iframe focus on window refocus", error);
      }
    });
  };

  focusInHandler = handleFocusIn;
  windowBlurHandler = handleWindowBlur;
  windowFocusHandler = handleWindowFocus;

  document.addEventListener("focusin", handleFocusIn, true);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("focus", handleWindowFocus);
};

export const resetIframeFocusGuardForTests = (): void => {
  if (typeof document !== "undefined" && focusInHandler) {
    document.removeEventListener("focusin", focusInHandler, true);
  }

  if (typeof window !== "undefined") {
    if (windowBlurHandler) {
      window.removeEventListener("blur", windowBlurHandler);
    }
    if (windowFocusHandler) {
      window.removeEventListener("focus", windowFocusHandler);
    }
  }

  if (typeof document !== "undefined") {
    document.getElementById(FOCUS_GUARD_FALLBACK_ID)?.remove();
  }

  focusGuardFallbackElement = null;
  focusGuardInitialized = false;
  focusInHandler = null;
  windowBlurHandler = null;
  windowFocusHandler = null;
  lastActiveElement = null;
  focusedIframeBeforeBlur = null;
  windowHasFocus = typeof document !== "undefined" ? document.hasFocus() : true;
  iframeFocusAllowedChecker = () => true;
};

/**
 * Returns whether the window currently has focus.
 * Useful for components that need to know focus state without querying document.hasFocus().
 */
export const getWindowHasFocus = (): boolean => windowHasFocus;

/**
 * Manually clear the stored iframe focus ownership.
 * Call this when programmatically moving focus away from iframes.
 */
export const clearFocusedIframeBeforeBlur = (): void => {
  focusedIframeBeforeBlur = null;
};
