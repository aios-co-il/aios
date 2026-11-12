import { toPng } from "html-to-image";
import { waitForSnapshotReady } from "@/lib/reportSync";

/**
 * Browsers silently return an invalid "data:," URL past their canvas limit
 * (~32k px), which broke tall reports such as Google Ads with many daily rows.
 */
const MAX_CANVAS_PX = 16000;

/**
 * Photographs the single report's summary as a PNG, cut at its
 * `data-snapshot-end` marker, with the pixel ratio lowered (and the image
 * hard-cropped) so a tall report still yields a valid image.
 */
export async function captureReportImage(node: HTMLElement): Promise<Blob> {
  await waitForSnapshotReady(node);
  const markerHeight = heightToEndMarker(node);
  const fullHeight =
    markerHeight ?? Math.ceil(node.getBoundingClientRect().height);
  let pixelRatio = 1.5;
  if (fullHeight * pixelRatio > MAX_CANVAS_PX) {
    pixelRatio = Math.max(0.75, MAX_CANVAS_PX / fullHeight);
  }
  let captureHeight = markerHeight;
  if (fullHeight * pixelRatio > MAX_CANVAS_PX) {
    captureHeight = Math.floor(MAX_CANVAS_PX / pixelRatio);
  }
  const dataUrl = await toPng(node, {
    quality: 0.9,
    pixelRatio,
    backgroundColor: "#ffffff",
    skipFonts: true,
    ...(captureHeight
      ? {
          height: captureHeight,
          canvasHeight: Math.floor(captureHeight * pixelRatio),
        }
      : {}),
  });
  // An oversized or failed canvas yields an empty data URL.
  if (!dataUrl || dataUrl.length < 200) {
    throw new Error("הצילום ריק (הדוח ארוך מדי?)");
  }
  return (await fetch(dataUrl)).blob();
}

/** The height from the node's top to its snapshot-end marker, if it has one. */
function heightToEndMarker(node: HTMLElement): number | undefined {
  const endMarker = node.querySelector<HTMLElement>(
    '[data-snapshot-end="true"]',
  );
  if (!endMarker) {
    return undefined;
  }
  const computed = Math.ceil(
    endMarker.getBoundingClientRect().top - node.getBoundingClientRect().top,
  );
  return computed > 100 ? computed : undefined;
}
