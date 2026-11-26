import { createContext } from "react";

/** The header element a screen's search box renders into, once it is mounted. */
export interface HeaderSearchTarget {
  slot: HTMLElement | null;
  setSlot: (slot: HTMLElement | null) => void;
}

export const HeaderSearchContext = createContext<HeaderSearchTarget | null>(
  null,
);
