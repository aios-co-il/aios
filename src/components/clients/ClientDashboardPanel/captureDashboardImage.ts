import { toJpeg } from "html-to-image";
import { waitForSnapshotReady } from "@/lib/reportSync";

/** Gmail caps attachments at 25MB and Green API tends to fail past ~20MB. */
const MAX_IMAGE_MB = 22;

/**
 * Photographs the dashboard summary: the snapshot frame (header, KPIs and the
 * platform breakdown) cut at its `data-snapshot-end` marker, as a JPEG, which
 * is far smaller than a PNG for chart-heavy content.
 */
export async function captureDashboardImage(node: HTMLElement): Promise<Blob> {
  await waitForSnapshotReady(node);
  // Falls back to the whole node for SEO/WooCommerce/Analytics-only views.
  const frame =
    node.querySelector<HTMLElement>('[data-snapshot-frame="true"]') || node;
  const { widthPx, heightPx } = frameSize(frame);
  const dataUrl = await toJpeg(frame, {
    quality: 0.82,
    pixelRatio: pixelRatioFor(widthPx * heightPx),
    backgroundColor: "#ffffff",
    skipFonts: true,
    cacheBust: true,
    width: widthPx,
    height: heightPx,
    canvasWidth: widthPx,
    canvasHeight: heightPx,
    style: { height: `${heightPx}px`, overflow: "hidden" },
  });
  if (!dataUrl || dataUrl.length < 1000) {
    throw new Error("הצילום ריק");
  }
  const blob = await (await fetch(dataUrl)).blob();
  const sizeMB = blob.size / (1024 * 1024);
  if (sizeMB > MAX_IMAGE_MB) {
    throw new Error(
      `הצילום גדול מדי (${sizeMB.toFixed(1)}MB). נסה לפצל את הדשבורד לפחות כרטיסים.`,
    );
  }
  return blob;
}

/** The frame's size, its height cut at the snapshot-end marker when there is one. */
function frameSize(frame: HTMLElement) {
  const frameRect = frame.getBoundingClientRect();
  const widthPx = Math.max(frameRect.width, frame.scrollWidth || 0);
  let heightPx = Math.max(frameRect.height, frame.scrollHeight || 0);
  const endMarker = frame.querySelector<HTMLElement>(
    '[data-snapshot-end="true"]',
  );
  if (endMarker) {
    const clipped = endMarker.getBoundingClientRect().bottom - frameRect.top;
    if (clipped > 200 && clipped < heightPx) {
      heightPx = clipped;
    }
  }
  return { widthPx, heightPx };
}

/** Lowers the pixel ratio as the image grows (≈1200×8000 at 1.0). */
function pixelRatioFor(totalPx: number): number {
  if (totalPx > 20_000_000) {
    return 0.7;
  }
  if (totalPx > 12_000_000) {
    return 0.85;
  }
  if (totalPx > 6_000_000) {
    return 1.0;
  }
  return 1.5;
}
