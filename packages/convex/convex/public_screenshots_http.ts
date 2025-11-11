import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

export const serveSharedScreenshot = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const imageIndexParam = url.searchParams.get("image") ?? "0";

  if (!token) {
    return badRequest("missing token");
  }

  const imageIndex = Number(imageIndexParam);
  if (!Number.isFinite(imageIndex) || imageIndex < 0) {
    return badRequest("invalid image index");
  }

  const screenshotSet = await ctx.runQuery(
    internal.taskRunScreenshotSets.getByShareToken,
    { token },
  );

  if (!screenshotSet || screenshotSet.status !== "completed") {
    return new Response("not found", { status: 404 });
  }

  const image = screenshotSet.images[imageIndex];
  if (!image) {
    return new Response("not found", { status: 404 });
  }

  const data = await ctx.storage.get(image.storageId);
  if (!data) {
    return new Response("not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": image.mimeType ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  if (image.fileName) {
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(image.fileName)}"`,
    );
  }

  return new Response(data, { status: 200, headers });
});
