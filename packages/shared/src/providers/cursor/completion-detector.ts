import { createFileMarkerDetector } from "../common/file-marker-detector";

export function startCursorCompletionDetector(
  taskRunId: string
): Promise<void> {
  const markerFilename = `cursor-complete-${taskRunId}`;
  return createFileMarkerDetector({
    markerPath: `/root/lifecycle/${markerFilename}`,
    watchDir: "/root/lifecycle",
    markerFilename,
  });
}
