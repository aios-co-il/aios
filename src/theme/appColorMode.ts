import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ThemeMode } from "./tokens";

const STORAGE_KEY = "aios-app-color-mode";
const listeners = new Set<() => void>();
/** The choice when storage is blocked (private window); lasts until reload. */
let memoryMode: ThemeMode = "light";

/**
 * The app's light or dark mode, a per-browser choice that starts light. Every
 * caller shares one value, so the menu switch and the layout stay in step.
 */
export function useAppColorMode() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "light");
  const toggle = useCallback(() => {
    writeMode(readMode() === "dark" ? "light" : "dark");
  }, []);
  return { mode, toggle };
}

/**
 * Puts the `dark` class on <html> while the app layout is mounted, so the
 * whole app, its dialogs and Carmen's chat follow the mode. Leaving the app
 * (landing, sign-in) removes it, as those pages pick their own mode.
 */
export function useApplyAppColorMode() {
  const { mode } = useAppColorMode();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    return () => root.classList.remove("dark");
  }, [mode]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      return saved;
    }
  } catch {
    // Storage blocked: fall back to this visit's choice.
  }
  return memoryMode;
}

function writeMode(mode: ThemeMode) {
  memoryMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch (error) {
    // The choice then lasts until reload, which is fine for a display preference.
    console.warn("Could not save the color mode", error);
  }
  listeners.forEach((listener) => listener());
}
