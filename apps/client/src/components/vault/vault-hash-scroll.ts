const HASH_SCROLL_OFFSET_PX = 24;

interface ScrollContainerToHashTargetArgs {
  container: HTMLElement | null;
  hash: string;
}

function setContainerScrollTop(container: HTMLElement, top: number) {
  if (typeof container.scrollTo === "function") {
    container.scrollTo({
      top,
      behavior: "auto",
    });
    return;
  }

  container.scrollTop = top;
}

function getEscapedHashTargetId(hash: string): string | undefined {
  if (!hash.startsWith("#")) {
    return undefined;
  }

  const decodedId = decodeURIComponent(hash.slice(1)).trim();
  if (!decodedId) {
    return undefined;
  }

  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(decodedId);
  }

  return decodedId.replace(/["\\]/g, "\\$&");
}

export function scrollContainerToHashTarget({
  container,
  hash,
}: ScrollContainerToHashTargetArgs): boolean {
  if (!container) {
    return false;
  }

  const escapedTargetId = getEscapedHashTargetId(hash);
  if (!escapedTargetId) {
    return false;
  }

  const target = container.querySelector<HTMLElement>(`#${escapedTargetId}`);
  if (!target) {
    return false;
  }

  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top =
    container.scrollTop +
    (targetRect.top - containerRect.top) -
    HASH_SCROLL_OFFSET_PX;

  setContainerScrollTop(container, Math.max(top, 0));

  return true;
}

export function resetHashScrollContainer(container: HTMLElement | null) {
  if (!container) {
    return;
  }

  setContainerScrollTop(container, 0);
}
