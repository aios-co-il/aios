import { createContext, useContext } from "react";

/** Whether the panel shows icons only, and how a collapsed control asks it to open. */
export interface ModuleSidePanelState {
  collapsed: boolean;
  expand: () => void;
}

export const ModuleSidePanelContext = createContext<ModuleSidePanelState>({
  collapsed: false,
  expand: () => {},
});

/** The enclosing side panel's state; outside a panel it reads as open. */
export function useModuleSidePanel(): ModuleSidePanelState {
  return useContext(ModuleSidePanelContext);
}
