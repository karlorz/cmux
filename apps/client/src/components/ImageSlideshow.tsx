import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlideshowImage {
  dataUrl: string;
  label: string;
  filePath: string;
}

interface ImageSlideshowProps {
  images: SlideshowImage[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageSlideshow({
  images,
  initialIndex,
  isOpen,
  onClose,
}: ImageSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Reset to initial index when it changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, images.length, onClose]);

  if (!isOpen) return null;

  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-white">
            {currentImage.label}
          </p>
          <p className="text-xs text-neutral-400 font-mono">
            {currentImage.filePath}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400">
            {currentIndex + 1} / {images.length}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white"
            aria-label="Close slideshow"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentImage.dataUrl}
          alt={currentImage.label}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Navigation controls */}
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrevious();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors text-white"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors text-white"
            aria-label="Next image"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="px-4 py-3 bg-black/50 backdrop-blur-sm">
          <div className="flex gap-2 overflow-x-auto">
            {images.map((img, index) => (
              <button
                key={`${img.filePath}-${index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(index);
                }}
                className={cn(
                  "flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all",
                  index === currentIndex
                    ? "border-emerald-400 ring-2 ring-emerald-400/30"
                    : "border-neutral-600 hover:border-neutral-400 opacity-70 hover:opacity-100"
                )}
              >
                <img
                  src={img.dataUrl}
                  alt={img.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
