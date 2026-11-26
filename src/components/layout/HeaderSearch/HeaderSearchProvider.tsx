import { useMemo, useState, type ReactNode } from "react";

import { HeaderSearchContext } from "./headerSearchContext";

/** Connects the header's search slot to the screen that fills it. */
export function HeaderSearchProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const target = useMemo(() => ({ slot, setSlot }), [slot]);

  return (
    <HeaderSearchContext.Provider value={target}>
      {children}
    </HeaderSearchContext.Provider>
  );
}
