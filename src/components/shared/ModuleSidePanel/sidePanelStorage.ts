/** One key per module, so each screen remembers its own panel. */
export function sidePanelStorageKey(module: string): string {
  return `aios.sidePanel.${module}`;
}

/**
 * Reads the saved state. The panel starts collapsed until the viewer opens
 * it, so a missing or unreadable value means collapsed.
 */
export function readSidePanelCollapsed(
  storage: Pick<Storage, "getItem"> | undefined,
  module: string,
): boolean {
  try {
    return storage?.getItem(sidePanelStorageKey(module)) !== "open";
  } catch (error) {
    console.warn("Side panel state could not be read", error);
    return true;
  }
}

/** Saves the state; private windows and blocked storage only lose the memory. */
export function writeSidePanelCollapsed(
  storage: Pick<Storage, "setItem"> | undefined,
  module: string,
  collapsed: boolean,
): void {
  try {
    storage?.setItem(
      sidePanelStorageKey(module),
      collapsed ? "collapsed" : "open",
    );
  } catch (error) {
    console.warn("Side panel state could not be saved", error);
  }
}
