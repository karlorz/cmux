import { useCallback, useEffect, useState, type CSSProperties } from "react";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingSpotlightProps {
  targetSelector?: string;
  padding?: number;
  isActive: boolean;
}

export function OnboardingSpotlight({
  targetSelector,
  padding = 8,
  isActive,
}: OnboardingSpotlightProps) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const updateRect = useCallback(() => {
    if (!targetSelector || !isActive) {
      setRect(null);
      return;
    }

    const element = document.querySelector(targetSelector);
    if (!element) {
      setRect(null);
      return;
    }

    const domRect = element.getBoundingClientRect();
    setRect({
      top: domRect.top - padding,
      left: domRect.left - padding,
      width: domRect.width + padding * 2,
      height: domRect.height + padding * 2,
    });
  }, [targetSelector, padding, isActive]);

  useEffect(() => {
    updateRect();

    // Update on scroll and resize
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    // Also observe DOM changes
    const observer = new MutationObserver(updateRect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      observer.disconnect();
    };
  }, [updateRect]);

  if (!isActive) return null;

  // For center-placement steps (no target), just show the backdrop
  if (!targetSelector || !rect) {
    return (
      <div
        className="fixed inset-0 bg-black/60 transition-opacity duration-300"
        style={{ zIndex: 9998 }}
        aria-hidden="true"
      />
    );
  }

  // Use clip-path to create a spotlight effect
  const clipPath = `polygon(
    0% 0%,
    0% 100%,
    ${rect.left}px 100%,
    ${rect.left}px ${rect.top}px,
    ${rect.left + rect.width}px ${rect.top}px,
    ${rect.left + rect.width}px ${rect.top + rect.height}px,
    ${rect.left}px ${rect.top + rect.height}px,
    ${rect.left}px 100%,
    100% 100%,
    100% 0%
  )`;

  const backdropStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    clipPath,
    zIndex: 9998,
    pointerEvents: "none",
    transition: "clip-path 0.3s ease-out",
  };

  // Highlight ring around the target
  const highlightStyle: CSSProperties = {
    position: "fixed",
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: "12px",
    boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.5), 0 0 24px rgba(59, 130, 246, 0.3)",
    zIndex: 9999,
    pointerEvents: "none",
    transition: "all 0.3s ease-out",
  };

  return (
    <>
      <div style={backdropStyle} aria-hidden="true" />
      <div style={highlightStyle} aria-hidden="true" />
    </>
  );
}
