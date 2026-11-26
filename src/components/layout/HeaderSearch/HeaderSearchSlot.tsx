import { useContext } from "react";

import { HeaderSearchContext } from "./headerSearchContext";

/**
 * The place in the app header where the current screen shows its search box.
 * Empty on screens without one, and hidden below `md`, where screens keep
 * their own mobile search.
 */
export function HeaderSearchSlot() {
  const target = useContext(HeaderSearchContext);

  return (
    <div
      ref={target?.setSlot}
      className="hidden flex-1 justify-center md:flex"
    />
  );
}
