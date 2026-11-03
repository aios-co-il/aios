import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isChunkLoadError } from "./chunkErrors";

const RETRY_KEY = "aios-lazy-chunk-reload";

/**
 * lazy() that reloads once on a stale-chunk miss instead of throwing into
 * the full-page error boundary.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(RETRY_KEY);
      } catch {
        // ignore
      }
      return mod;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;

      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RETRY_KEY) === "1";
      } catch {
        // ignore
      }

      if (!alreadyReloaded) {
        try {
          sessionStorage.setItem(RETRY_KEY, "1");
        } catch {
          // ignore
        }
        window.location.reload();
        // The page is reloading: stay suspended instead of resolving to a
        // placeholder component that would not satisfy `T`.
        return new Promise<never>(() => {});
      }

      throw error;
    }
  });
}
