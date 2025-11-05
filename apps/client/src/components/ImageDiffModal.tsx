import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

interface ImageInfo {
  filePath: string;
  oldContent?: string;
  newContent?: string;
  status: "added" | "deleted" | "modified" | "renamed";
}

interface ImageDiffModalProps {
  images: ImageInfo[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageDiffModal({
  images,
  initialIndex,
  onClose,
}: ImageDiffModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const currentImage = images[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const goToPrevious = useCallback(() => {
    if (hasPrevious) {
      setCurrentIndex((prev) => prev - 1);
      resetZoom();
    }
  }, [hasPrevious, resetZoom]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex((prev) => prev + 1);
      resetZoom();
    }
  }, [hasNext, resetZoom]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrevious) {
        goToPrevious();
      } else if (e.key === "ArrowRight" && hasNext) {
        goToNext();
      } else if (e.key === "+" || e.key === "=") {
        handleZoomIn();
      } else if (e.key === "-") {
        handleZoomOut();
      } else if (e.key === "0") {
        resetZoom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, hasPrevious, hasNext, onClose, goToPrevious, goToNext, handleZoomIn, handleZoomOut, resetZoom]);

  // Touchpad/Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        setZoom((prev) => Math.max(0.25, Math.min(5, prev + delta)));
      }
    },
    []
  );

  // Mouse drag for panning when zoomed
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom > 1) {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      }
    },
    [zoom, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const getImageSrc = (content: string) => {
    // Content is base64 encoded
    if (content.startsWith("data:")) {
      return content;
    }
    // Try to detect image type from filename
    const ext = currentImage.filePath.split(".").pop()?.toLowerCase();
    const mimeType =
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "gif"
        ? "image/gif"
        : ext === "webp"
        ? "image/webp"
        : ext === "svg"
        ? "image/svg+xml"
        : "image/png";
    return `data:${mimeType};base64,${content}`;
  };

  const renderImage = () => {
    if (currentImage.status === "added" && currentImage.newContent) {
      return (
        <div className="flex h-full items-center justify-center">
          <img
            src={getImageSrc(currentImage.newContent)}
            alt={currentImage.filePath}
            className="max-h-full max-w-full object-contain"
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${
                position.y / zoom
              }px)`,
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            draggable={false}
          />
        </div>
      );
    }

    if (currentImage.status === "deleted" && currentImage.oldContent) {
      return (
        <div className="flex h-full items-center justify-center">
          <img
            src={getImageSrc(currentImage.oldContent)}
            alt={currentImage.filePath}
            className="max-h-full max-w-full object-contain"
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${
                position.y / zoom
              }px)`,
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            draggable={false}
          />
        </div>
      );
    }

    if (
      (currentImage.status === "modified" || currentImage.status === "renamed") &&
      currentImage.oldContent &&
      currentImage.newContent
    ) {
      return (
        <div className="grid h-full grid-cols-2 gap-4 p-4">
          <div className="flex flex-col">
            <div className="mb-2 text-center text-sm font-medium text-red-500">
              Before
            </div>
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded border border-neutral-200 dark:border-neutral-700">
              <img
                src={getImageSrc(currentImage.oldContent)}
                alt={`${currentImage.filePath} (old)`}
                className="max-h-full max-w-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${position.x / zoom}px, ${
                    position.y / zoom
                  }px)`,
                  cursor:
                    zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                draggable={false}
              />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="mb-2 text-center text-sm font-medium text-green-500">
              After
            </div>
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded border border-neutral-200 dark:border-neutral-700">
              <img
                src={getImageSrc(currentImage.newContent)}
                alt={`${currentImage.filePath} (new)`}
                className="max-h-full max-w-full object-contain"
                style={{
                  transform: `scale(${zoom}) translate(${position.x / zoom}px, ${
                    position.y / zoom
                  }px)`,
                  cursor:
                    zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                draggable={false}
              />
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[var(--z-global-blocking)] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onWheel={handleWheel}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 bg-neutral-900/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">
            {currentImage.filePath}
          </span>
          <span className="text-xs text-neutral-400">
            {currentIndex + 1} / {images.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.25}
            className="rounded p-1.5 text-white transition hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Zoom out (-)"
          >
            <ZoomOut size={20} />
          </button>
          <span className="min-w-[4rem] text-center text-sm text-white">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 5}
            className="rounded p-1.5 text-white transition hover:bg-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Zoom in (+)"
          >
            <ZoomIn size={20} />
          </button>
          <button
            onClick={resetZoom}
            className="ml-2 rounded px-2 py-1.5 text-xs text-white transition hover:bg-neutral-700"
            title="Reset zoom (0)"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="ml-2 rounded p-1.5 text-white transition hover:bg-neutral-700"
            title="Close (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image viewer */}
      <div className="relative flex-1 overflow-hidden">{renderImage()}</div>

      {/* Navigation */}
      {images.length > 1 && (
        <>
          {hasPrevious && (
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-neutral-800/80 p-3 text-white transition hover:bg-neutral-700"
              title="Previous (←)"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          {hasNext && (
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-neutral-800/80 p-3 text-white transition hover:bg-neutral-700"
              title="Next (→)"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </>
      )}

      {/* Instructions */}
      <div className="border-t border-neutral-700 bg-neutral-900/80 px-4 py-2 text-center text-xs text-neutral-400">
        Use arrow keys to navigate • Ctrl/Cmd + Scroll to zoom • Drag to pan when
        zoomed • Press Esc to close
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? modalContent
    : createPortal(modalContent, document.body);
}
