import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { HeaderSearchContext } from "./headerSearchContext";

/**
 * Shows a screen's own search box in the app header on desktop, so it takes
 * no row above the screen's content. The box keeps the screen's state and
 * placeholder. Outside the app layout it renders in place.
 */
export function HeaderSearch({ children }: { children: ReactNode }) {
  const target = useContext(HeaderSearchContext);
  // The minimum width keeps the box usable when the header is crowded.
  const box = <div className="w-full min-w-44 max-w-sm">{children}</div>;

  if (!target) {
    return box;
  }

  return target.slot ? createPortal(box, target.slot) : null;
}
