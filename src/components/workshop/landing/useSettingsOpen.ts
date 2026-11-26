import { useState } from "react";

const STORAGE_KEY = "aios.workshop.landing-settings-open";

/** Whether this browser last left the panel open; open when it never chose or cannot say. */
function storedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Whether the landing settings panel is open. The choice is this browser's own and holds for every
 * landing project, so a user who closed it keeps seeing the page's copy.
 */
export function useSettingsOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(storedOpen);
  function change(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Blocked storage only loses the remembered choice; the panel still opens and closes.
    }
  }
  return [open, change];
}
