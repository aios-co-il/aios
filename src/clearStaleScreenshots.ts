// Old app versions cached report and dashboard screenshots in localStorage
// under report-screenshot-* and dashboard-screenshot-* (one user had ~10 MB).
// Nothing reads them any more, but they fill the quota, so supabase-js cannot
// save its session ("exceeded the quota") and sign-in fails. main.tsx imports
// this module first, so the keys are gone before the Supabase client loads.

const STALE_SCREENSHOT_KEY = /^(report|dashboard)-screenshot-/;

clearStaleScreenshots();

/** Removes the stale screenshot keys from `storage` and returns how many it removed. */
export function clearStaleScreenshots(storage?: Storage): number {
  try {
    const target = storage ?? window.localStorage;
    const staleKeys = Array.from({ length: target.length }, (_, index) =>
      target.key(index),
    ).filter((key): key is string => !!key && STALE_SCREENSHOT_KEY.test(key));

    for (const key of staleKeys) {
      target.removeItem(key);
    }

    return staleKeys.length;
  } catch (error) {
    // Blocked storage (private mode, sandboxed iframe) must not stop the app from loading.
    console.warn("Could not clear stale screenshot storage", error);
    return 0;
  }
}
