import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@cmux/convex/dataModel";

type ScreenshotStatus = "completed" | "failed" | "skipped";

interface ScreenshotImage {
  storageId: Id<"_storage">;
  mimeType: string;
  fileName?: string | null;
  commitSha?: string | null;
  url?: string | null;
}

interface RunScreenshotSet {
  _id: Id<"taskRunScreenshotSets">;
  taskId: Id<"tasks">;
  runId: Id<"taskRuns">;
  status: ScreenshotStatus;
  commitSha?: string | null;
  capturedAt: number;
  error?: string | null;
  images: ScreenshotImage[];
}

interface RunScreenshotGalleryProps {
  screenshotSets: RunScreenshotSet[];
  highlightedSetId?: Id<"taskRunScreenshotSets"> | null;
}

type ScreenshotImageWithUrl = ScreenshotImage & { url: string };

interface ViewerState {
  setId: Id<"taskRunScreenshotSets">;
  imageIndex: number;
}

const STATUS_LABELS: Record<ScreenshotStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

const STATUS_STYLES: Record<ScreenshotStatus, string> = {
  completed:
    "bg-emerald-100/70 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  failed: "bg-rose-100/70 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  skipped:
    "bg-neutral-200/70 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

function isViewableImage(
  image: ScreenshotImage
): image is ScreenshotImageWithUrl {
  return typeof image.url === "string" && image.url.length > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function RunScreenshotGallery(props: RunScreenshotGalleryProps) {
  const { screenshotSets, highlightedSetId } = props;
  if (!screenshotSets || screenshotSets.length === 0) {
    return null;
  }

  const effectiveHighlight =
    highlightedSetId ??
    (screenshotSets.length > 0 ? screenshotSets[0]._id : null);

  const [viewerState, setViewerState] = useState<ViewerState | null>(null);

  const setsById = useMemo(() => {
    const map = new Map<Id<"taskRunScreenshotSets">, RunScreenshotSet>();
    for (const set of screenshotSets) {
      map.set(set._id, set);
    }
    return map;
  }, [screenshotSets]);

  const activeSet =
    viewerState && setsById.has(viewerState.setId)
      ? setsById.get(viewerState.setId) ?? null
      : null;

  const activeImages = useMemo<ScreenshotImageWithUrl[]>(() => {
    if (!activeSet) {
      return [];
    }
    return activeSet.images.filter(isViewableImage);
  }, [activeSet]);

  const viewerOpen =
    viewerState !== null &&
    activeSet !== null &&
    viewerState.imageIndex >= 0 &&
    viewerState.imageIndex < activeImages.length;

  useEffect(() => {
    if (viewerState && !viewerOpen) {
      setViewerState(null);
    }
  }, [viewerOpen, viewerState]);

  const handleOpenViewer = useCallback(
    (setId: Id<"taskRunScreenshotSets">, imageIndex: number) => {
      setViewerState({ setId, imageIndex });
    },
    []
  );

  const handleCloseViewer = useCallback(() => {
    setViewerState(null);
  }, []);

  const handleViewerNavigate = useCallback(
    (direction: "next" | "prev") => {
      setViewerState((prev) => {
        if (!prev) {
          return prev;
        }
        const set = setsById.get(prev.setId);
        if (!set) {
          return null;
        }
        const images = set.images.filter(isViewableImage);
        if (images.length === 0) {
          return null;
        }
        const delta = direction === "next" ? 1 : -1;
        const nextIndex =
          (prev.imageIndex + delta + images.length) % images.length;
        return { ...prev, imageIndex: nextIndex };
      });
    },
    [setsById]
  );

  return (
    <>
      <section className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40">
        <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Screenshots
          </h2>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {screenshotSets.length}{" "}
            {screenshotSets.length === 1 ? "capture" : "captures"}
          </span>
        </div>
        <div className="px-3.5 pb-4 space-y-4">
          {screenshotSets.map((set) => {
            const capturedAtDate = new Date(set.capturedAt);
            const relativeCapturedAt = formatDistanceToNow(capturedAtDate, {
              addSuffix: true,
            });
            const shortCommit = set.commitSha?.slice(0, 12);
            const isHighlighted = effectiveHighlight === set._id;

            let lastViewableIndex = -1;

            return (
              <article
                key={set._id}
                className={cn(
                  "rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950/70 p-3 transition-shadow",
                  isHighlighted &&
                    "border-emerald-400/70 dark:border-emerald-400/60 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded-full",
                      STATUS_STYLES[set.status]
                    )}
                  >
                    {STATUS_LABELS[set.status]}
                  </span>
                  {isHighlighted && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                      Latest
                    </span>
                  )}
                  <span
                    className="text-xs text-neutral-600 dark:text-neutral-400"
                    title={capturedAtDate.toLocaleString()}
                  >
                    {relativeCapturedAt}
                  </span>
                  {shortCommit && (
                    <span className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                      {shortCommit.toLowerCase()}
                    </span>
                  )}
                  {set.images.length > 0 && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-500">
                      {set.images.length}{" "}
                      {set.images.length === 1 ? "image" : "images"}
                    </span>
                  )}
                </div>
                {set.error && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {set.error}
                  </p>
                )}
                {set.images.length > 0 ? (
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                    {set.images.map((image) => {
                      const key = `${image.storageId}-${image.fileName ?? "unnamed"}`;
                      if (!isViewableImage(image)) {
                        return (
                          <div
                            key={key}
                            className="flex h-48 min-w-[200px] items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 text-xs text-neutral-500 dark:text-neutral-400"
                          >
                            URL expired
                          </div>
                        );
                      }

                      lastViewableIndex += 1;
                      const viewerIndex = lastViewableIndex;
                      const handleActivate = () =>
                        handleOpenViewer(set._id, viewerIndex);

                      const handleKeyDown = (
                        event: React.KeyboardEvent<HTMLDivElement>
                      ) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleActivate();
                        }
                      };

                      const handleOpenOriginal = (
                        event: React.MouseEvent<HTMLButtonElement>
                      ) => {
                        event.stopPropagation();
                        if (typeof window !== "undefined") {
                          window.open(image.url, "_blank", "noopener,noreferrer");
                        }
                      };

                      return (
                        <div
                          key={key}
                          role="button"
                          aria-label={`View ${image.fileName ?? "screenshot"}`}
                          tabIndex={0}
                          onClick={handleActivate}
                          onKeyDown={handleKeyDown}
                          className="group relative flex w-[220px] cursor-zoom-in flex-col rounded-lg border border-neutral-200 bg-neutral-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-neutral-700 dark:bg-neutral-900/70 dark:focus-visible:ring-offset-neutral-950"
                        >
                          <img
                            src={image.url}
                            alt={image.fileName ?? "Screenshot"}
                            className="h-48 w-full object-contain bg-neutral-100 dark:bg-neutral-950"
                            loading="lazy"
                            draggable={false}
                          />
                          <button
                            type="button"
                            onClick={handleOpenOriginal}
                            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-neutral-700 opacity-0 shadow-sm transition group-hover:opacity-100 dark:bg-neutral-950/90 dark:text-neutral-200"
                            aria-label="Open original screenshot in a new tab"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                          <div className="border-t border-neutral-200 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300 truncate">
                            {image.fileName ?? "Screenshot"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {set.status === "failed"
                      ? "Screenshot capture failed before any images were saved."
                      : "No screenshots were captured for this attempt."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <ScreenshotViewerDialog
        open={viewerOpen}
        images={activeImages}
        currentIndex={viewerState?.imageIndex ?? 0}
        onClose={handleCloseViewer}
        onNext={() => handleViewerNavigate("next")}
        onPrev={() => handleViewerNavigate("prev")}
        capturedAt={activeSet?.capturedAt}
        commitSha={activeSet?.commitSha}
      />
    </>
  );
}

interface ScreenshotViewerDialogProps {
  open: boolean;
  images: ScreenshotImageWithUrl[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  capturedAt?: number;
  commitSha?: string | null;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function ScreenshotViewerDialog(props: ScreenshotViewerDialogProps) {
  const {
    open,
    images,
    currentIndex,
    onClose,
    onNext,
    onPrev,
    capturedAt,
    commitSha,
  } = props;

  const currentImage = images[currentIndex];
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStateRef = useRef<PanState | null>(null);

  useEffect(() => {
    if (!open) {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !currentImage) {
      return;
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [currentImage?.storageId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev();
      } else if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrev, open]);

  const zoomPercent = Math.round(zoom * 100);
  const relativeCapturedAt = capturedAt
    ? formatDistanceToNow(new Date(capturedAt), { addSuffix: true })
    : null;

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey) {
        event.preventDefault();
        const zoomFactor = Math.exp(-event.deltaY * 0.002);
        setZoom((prevZoom) => clamp(prevZoom * zoomFactor, 1, 5));
        return;
      }

      if (zoom > 1) {
        event.preventDefault();
        setOffset((prev) => ({
          x: prev.x - event.deltaX,
          y: prev.y - event.deltaY,
        }));
      }
    },
    [zoom]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      panStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [offset.x, offset.y]
  );

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!panStateRef.current || panStateRef.current.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const dx = event.clientX - panStateRef.current.startX;
    const dy = event.clientY - panStateRef.current.startY;
    setOffset({
      x: panStateRef.current.originX + dx,
      y: panStateRef.current.originY + dy,
    });
  }, []);

  const endPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (panStateRef.current && panStateRef.current.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      panStateRef.current = null;
      setIsPanning(false);
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom((prev) => (prev > 1 ? 1 : Math.min(2, 5)));
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleZoomStep = useCallback((delta: number) => {
    setZoom((prev) => clamp(prev + delta, 1, 5));
  }, []);

  if (!open || !currentImage) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-neutral-950/80 backdrop-blur-sm"
          onClick={onClose}
        />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col focus:outline-none">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/70 px-6 py-4 text-white">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold leading-tight">
                {currentImage.fileName ?? "Screenshot"}
              </Dialog.Title>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-300">
                <span>
                  Image {currentIndex + 1} / {images.length}
                </span>
                {relativeCapturedAt && (
                  <span>Captured {relativeCapturedAt}</span>
                )}
                {commitSha && (
                  <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide">
                    {commitSha.slice(0, 12).toLowerCase()}
                  </code>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="hidden text-neutral-300 md:inline">
                Scroll/pinch to zoom · Drag to pan
              </span>
              <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-neutral-100">
                <button
                  type="button"
                  onClick={() => handleZoomStep(-0.25)}
                  disabled={zoom <= 1}
                  className={cn(
                    "rounded-full p-1 transition disabled:opacity-30",
                    zoom > 1
                      ? "hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                      : ""
                  )}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-[3ch] text-center font-medium">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={() => handleZoomStep(0.25)}
                  disabled={zoom >= 5}
                  className={cn(
                    "rounded-full p-1 transition disabled:opacity-30",
                    zoom < 5
                      ? "hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                      : ""
                  )}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  className="rounded-full p-1 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                  aria-label="Reset zoom"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>
              <a
                href={currentImage.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-white/30 px-3 py-1 text-xs font-medium text-white transition hover:border-white/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
              >
                Open original
              </a>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white transition hover:border-white/60 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                aria-label="Close screenshot viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          <div
            className="relative flex-1 select-none bg-black/95 text-white touch-none"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerLeave={endPan}
            onDoubleClick={handleDoubleClick}
          >
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              <div
                className={cn(
                  "relative inline-flex max-h-full max-w-full select-none transition-transform",
                  zoom > 1
                    ? isPanning
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : "cursor-zoom-in"
                )}
                style={{
                  transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
                  transitionDuration: isPanning ? "0ms" : "120ms",
                }}
              >
                <img
                  src={currentImage.url}
                  alt={currentImage.fileName ?? "Screenshot"}
                  className="max-h-[85vh] max-w-full select-none rounded-xl shadow-2xl"
                  draggable={false}
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            </div>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={onPrev}
                  className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white backdrop-blur transition hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                  aria-label="Previous screenshot"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white backdrop-blur transition hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60"
                  aria-label="Next screenshot"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs text-white backdrop-blur">
              Scroll or pinch to zoom · Double-click to toggle zoom
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
