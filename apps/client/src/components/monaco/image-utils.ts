const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

export function isImageFile(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return false;
  }
  const ext = filePath.slice(lastDot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function createImageDataUrl(content: string | undefined): string | null {
  if (!content) {
    return null;
  }
  // Content should be base64 encoded
  // Detect the image format from the content or default to png
  return `data:image/png;base64,${content}`;
}
