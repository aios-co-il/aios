import { useEffect, useState } from "react";

export type ColorMode = "light" | "dark";

const STORAGE_KEY = "aios-landing-color-mode";

/**
 * Light or dark for the marketing page: remembered per visitor, and the
 * device setting on the first visit. Applied by the page itself (a `dark`
 * class on its root), so the app screens are not affected.
 */
export function useColorMode() {
  const [mode, setMode] = useState<ColorMode>(initialMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage can be blocked (private window); the choice then lasts for
      // this visit only, which is fine for a display preference.
    }
  }, [mode]);

  function toggle() {
    setMode((current) => (current === "dark" ? "light" : "dark"));
  }

  return { mode, toggle };
}

/** Saved choice, else the device's color-scheme preference. */
function initialMode(): ColorMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Storage blocked: fall through to the device preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
