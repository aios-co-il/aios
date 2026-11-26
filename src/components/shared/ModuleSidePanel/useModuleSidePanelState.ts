import { useCallback, useState } from "react";

import {
  readSidePanelCollapsed,
  writeSidePanelCollapsed,
} from "./sidePanelStorage";

/** The module's collapsed flag, remembered in this browser. */
export function useModuleSidePanelState(module: string) {
  const [collapsed, setCollapsedState] = useState(() =>
    readSidePanelCollapsed(browserStorage(), module),
  );

  const setCollapsed = useCallback(
    (next: boolean) => {
      setCollapsedState(next);
      writeSidePanelCollapsed(browserStorage(), module, next);
    },
    [module],
  );

  return [collapsed, setCollapsed] as const;
}

/** `window.localStorage` itself throws when site data is blocked. */
function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("Local storage is unavailable", error);
    return undefined;
  }
}
