import type { Id } from "@cmux/convex/dataModel";
import { ScreenshotGallery, type ScreenshotSet } from "./screenshots/ScreenshotGallery";

interface RunScreenshotGalleryProps {
  screenshotSets: ScreenshotSet[];
  highlightedSetId?: Id<"taskRunScreenshotSets"> | null;
}

export function RunScreenshotGallery(props: RunScreenshotGalleryProps) {
  return <ScreenshotGallery {...props} />;
}