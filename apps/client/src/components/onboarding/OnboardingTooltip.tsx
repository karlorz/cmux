import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { OnboardingStep } from "@/contexts/onboarding";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition?: "top" | "bottom" | "left" | "right";
}

interface OnboardingTooltipProps {
  step: OnboardingStep;
  currentIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
  isLastStep: boolean;
  isFirstStep: boolean;
}

const TOOLTIP_WIDTH = 340;
const TOOLTIP_OFFSET = 16;
const ARROW_SIZE = 8;

export function OnboardingTooltip({
  step,
  currentIndex,
  totalSteps,
  onNext,
  onPrevious,
  onSkip,
  isLastStep,
  isFirstStep,
}: OnboardingTooltipProps) {
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0 });

  const calculatePosition = useCallback(() => {
    // Center placement - show in the middle of the screen
    if (step.placement === "center" || !step.targetSelector) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      setPosition({
        top: viewportHeight / 2 - 100,
        left: viewportWidth / 2 - TOOLTIP_WIDTH / 2,
      });
      return;
    }

    const element = document.querySelector(step.targetSelector);
    if (!element) {
      // Fallback to center if element not found
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      setPosition({
        top: viewportHeight / 2 - 100,
        left: viewportWidth / 2 - TOOLTIP_WIDTH / 2,
      });
      return;
    }

    const rect = element.getBoundingClientRect();
    const padding = step.highlightPadding ?? 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let arrowPosition: TooltipPosition["arrowPosition"];

    switch (step.placement) {
      case "bottom":
        top = rect.bottom + padding + TOOLTIP_OFFSET;
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        arrowPosition = "top";
        break;
      case "top":
        top = rect.top - padding - TOOLTIP_OFFSET - 200; // Estimate tooltip height
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        arrowPosition = "bottom";
        break;
      case "left":
        top = rect.top + rect.height / 2 - 100;
        left = rect.left - padding - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
        arrowPosition = "right";
        break;
      case "right":
        top = rect.top + rect.height / 2 - 100;
        left = rect.right + padding + TOOLTIP_OFFSET;
        arrowPosition = "left";
        break;
      default:
        top = rect.bottom + padding + TOOLTIP_OFFSET;
        left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        arrowPosition = "top";
    }

    // Ensure tooltip stays within viewport
    if (left < 16) left = 16;
    if (left + TOOLTIP_WIDTH > viewportWidth - 16) {
      left = viewportWidth - TOOLTIP_WIDTH - 16;
    }
    if (top < 16) top = 16;
    if (top > viewportHeight - 250) {
      top = viewportHeight - 250;
    }

    setPosition({ top, left, arrowPosition });
  }, [step]);

  useEffect(() => {
    calculatePosition();

    window.addEventListener("scroll", calculatePosition, true);
    window.addEventListener("resize", calculatePosition);

    return () => {
      window.removeEventListener("scroll", calculatePosition, true);
      window.removeEventListener("resize", calculatePosition);
    };
  }, [calculatePosition]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        onNext();
      } else if (e.key === "ArrowLeft" && !isFirstStep) {
        onPrevious();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrevious, onSkip, isFirstStep]);

  const tooltipStyle: CSSProperties = {
    position: "fixed",
    top: position.top,
    left: position.left,
    width: TOOLTIP_WIDTH,
    zIndex: 10000,
    transition: "top 0.3s ease-out, left 0.3s ease-out",
  };

  const arrowStyle: CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
    ...(position.arrowPosition === "top" && {
      top: -ARROW_SIZE,
      left: "50%",
      transform: "translateX(-50%)",
      borderLeft: `${ARROW_SIZE}px solid transparent`,
      borderRight: `${ARROW_SIZE}px solid transparent`,
      borderBottom: `${ARROW_SIZE}px solid white`,
    }),
    ...(position.arrowPosition === "bottom" && {
      bottom: -ARROW_SIZE,
      left: "50%",
      transform: "translateX(-50%)",
      borderLeft: `${ARROW_SIZE}px solid transparent`,
      borderRight: `${ARROW_SIZE}px solid transparent`,
      borderTop: `${ARROW_SIZE}px solid white`,
    }),
    ...(position.arrowPosition === "left" && {
      left: -ARROW_SIZE,
      top: "50%",
      transform: "translateY(-50%)",
      borderTop: `${ARROW_SIZE}px solid transparent`,
      borderBottom: `${ARROW_SIZE}px solid transparent`,
      borderRight: `${ARROW_SIZE}px solid white`,
    }),
    ...(position.arrowPosition === "right" && {
      right: -ARROW_SIZE,
      top: "50%",
      transform: "translateY(-50%)",
      borderTop: `${ARROW_SIZE}px solid transparent`,
      borderBottom: `${ARROW_SIZE}px solid transparent`,
      borderLeft: `${ARROW_SIZE}px solid white`,
    }),
  };

  return (
    <div style={tooltipStyle}>
      <div className="relative bg-white dark:bg-neutral-800 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        {/* Arrow */}
        {position.arrowPosition && step.placement !== "center" && (
          <div
            style={{
              ...arrowStyle,
              ...(position.arrowPosition === "top" && {
                borderBottomColor: "var(--tooltip-bg, white)",
              }),
              ...(position.arrowPosition === "bottom" && {
                borderTopColor: "var(--tooltip-bg, white)",
              }),
              ...(position.arrowPosition === "left" && {
                borderRightColor: "var(--tooltip-bg, white)",
              }),
              ...(position.arrowPosition === "right" && {
                borderLeftColor: "var(--tooltip-bg, white)",
              }),
            }}
            className="[--tooltip-bg:theme(colors.white)] dark:[--tooltip-bg:theme(colors.neutral.800)]"
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-semibold">
              {currentIndex + 1}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              of {totalSteps}
            </span>
          </div>
          <button
            onClick={onSkip}
            className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 transition-colors"
            aria-label="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
            {step.title}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-3">
          <div className="h-1 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300 ease-out"
              style={{ width: `${((currentIndex + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={onPrevious}
            disabled={isFirstStep}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="px-3 py-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              Skip tour
            </button>
            <button
              onClick={onNext}
              className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              {isLastStep ? "Get started" : "Next"}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
