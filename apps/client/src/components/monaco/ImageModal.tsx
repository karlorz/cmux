import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ImageData {
  oldUrl: string | null;
  newUrl: string | null;
  filePath: string;
}

interface ImageModalProps {
  images: ImageData[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageModal({
  images,
  initialIndex,
  open,
  onOpenChange,
}: ImageModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < images.length - 1;

  // Reset zoom and position when changing images
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  // Reset index when modal opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [open, initialIndex]);

  const goToPrevious = useCallback(() => {
    if (canGoPrevious) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [canGoPrevious]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [canGoNext]);

  const handleZoom = useCallback(
    (delta: number, centerX?: number, centerY?: number) => {
      setZoom((prevZoom) => {
        const newZoom = Math.max(0.25, Math.min(5, prevZoom + delta));

        // If we have a center point, adjust position to zoom towards it
        if (
          centerX !== undefined &&
          centerY !== undefined &&
          imageContainerRef.current
        ) {
          const rect = imageContainerRef.current.getBoundingClientRect();
          const relativeX = (centerX - rect.left - rect.width / 2) / prevZoom;
          const relativeY = (centerY - rect.top - rect.height / 2) / prevZoom;

          setPosition((prevPos) => ({
            x: prevPos.x - relativeX * (newZoom - prevZoom),
            y: prevPos.y - relativeY * (newZoom - prevZoom),
          }));
        }

        return newZoom;
      });
    },
    [],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault();

      // Check if it's a pinch gesture (trackpad zoom)
      if (event.ctrlKey || event.metaKey) {
        // Pinch zoom
        const delta = -event.deltaY * 0.01;
        handleZoom(delta, event.clientX, event.clientY);
      } else {
        // Regular scroll - pan the image if zoomed in
        if (zoom > 1) {
          setPosition((prev) => ({
            x: prev.x - event.deltaX,
            y: prev.y - event.deltaY,
          }));
        }
      }
    },
    [zoom, handleZoom],
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (zoom > 1) {
        setIsDragging(true);
        setDragStart({
          x: event.clientX - position.x,
          y: event.clientY - position.y,
        });
      }
    },
    [zoom, position],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: event.clientX - dragStart.x,
          y: event.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          goToPrevious();
          break;
        case "ArrowRight":
          event.preventDefault();
          goToNext();
          break;
        case "Escape":
          event.preventDefault();
          onOpenChange(false);
          break;
        case "=":
        case "+":
          event.preventDefault();
          handleZoom(0.2);
          break;
        case "-":
          event.preventDefault();
          handleZoom(-0.2);
          break;
        case "0":
          event.preventDefault();
          setZoom(1);
          setPosition({ x: 0, y: 0 });
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, goToPrevious, goToNext, onOpenChange, handleZoom]);

  if (!currentImage) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal,9999)] bg-black/90 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-0 z-[var(--z-modal,9999)] flex flex-col focus:outline-none"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-black/50 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <Dialog.Title className="text-sm font-medium text-white">
                {currentImage.filePath}
              </Dialog.Title>
              {hasMultipleImages && (
                <span className="text-xs text-neutral-400">
                  {currentIndex + 1} / {images.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">
                {Math.round(zoom * 100)}%
              </span>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full p-2 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Main content area */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {/* Navigation buttons */}
            {hasMultipleImages && (
              <>
                {canGoPrevious && (
                  <button
                    type="button"
                    onClick={goToPrevious}
                    className="absolute left-4 z-10 rounded-full bg-black/50 p-3 text-white backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}
                {canGoNext && (
                  <button
                    type="button"
                    onClick={goToNext}
                    className="absolute right-4 z-10 rounded-full bg-black/50 p-3 text-white backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                )}
              </>
            )}

            {/* Image container */}
            <div
              ref={imageContainerRef}
              className="flex h-full w-full items-center justify-center"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              }}
            >
              <div className="flex gap-8">
                {/* Old version (before) */}
                {currentImage.oldUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-neutral-400">
                      Before
                    </span>
                    <img
                      src={currentImage.oldUrl}
                      alt={`${currentImage.filePath} (before)`}
                      className="max-h-[70vh] object-contain"
                      style={{
                        transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                        transition: isDragging ? "none" : "transform 0.1s ease-out",
                      }}
                      draggable={false}
                    />
                  </div>
                )}

                {/* New version (after) */}
                {currentImage.newUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-xs font-medium text-neutral-400">
                      After
                    </span>
                    <img
                      src={currentImage.newUrl}
                      alt={`${currentImage.filePath} (after)`}
                      className="max-h-[70vh] object-contain"
                      style={{
                        transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                        transition: isDragging ? "none" : "transform 0.1s ease-out",
                      }}
                      draggable={false}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer with instructions */}
          <div className="bg-black/50 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-xs text-neutral-400">
              Use arrow keys to navigate • Scroll or pinch to zoom • Click and
              drag to pan
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
