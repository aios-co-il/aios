import { useCallback, useRef, useState, type RefObject } from "react";

/** Photographs the mounted capture render; the panel picks the format. */
export type CaptureImage = (node: HTMLElement) => Promise<Blob>;

/** How long the hidden render may take to attach before the capture gives up. */
const MOUNT_TIMEOUT_MS = 10_000;

/**
 * Takes the summary image on demand. `capture` mounts the hidden render
 * (`active` turns on), waits for it, photographs it and unmounts it again,
 * so nothing is rendered or photographed until someone sends or exports.
 * A second call while one runs shares the running capture.
 */
export function useSummaryCapture(captureImage: CaptureImage) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef<Promise<Blob> | null>(null);
  const [active, setActive] = useState(false);

  const capture = useCallback((): Promise<Blob> => {
    if (runningRef.current) {
      return runningRef.current;
    }
    setActive(true);
    const running = (async () => {
      try {
        const node = await waitForNode(nodeRef);
        return await captureImage(node);
      } finally {
        runningRef.current = null;
        setActive(false);
      }
    })();
    runningRef.current = running;
    return running;
  }, [captureImage]);

  return { nodeRef, active, capture };
}

/** Resolves with the hidden render's node once React has attached it. */
async function waitForNode(
  nodeRef: RefObject<HTMLDivElement>,
): Promise<HTMLElement> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MOUNT_TIMEOUT_MS) {
    if (nodeRef.current) {
      return nodeRef.current;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error("רכיב הצילום לא נטען");
}
