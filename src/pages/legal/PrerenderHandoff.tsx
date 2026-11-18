import { useLayoutEffect } from "react";
import { SNAPSHOT_ID } from "./preserveLegalPrerender";

/** Inside Suspense, this effect runs only once the route can be displayed. */
export function PrerenderHandoff() {
  useLayoutEffect(() => {
    const snapshot = document.getElementById(SNAPSHOT_ID);
    if (!snapshot) {
      return;
    }

    const root = document.getElementById("root");
    if (root) {
      root.hidden = false;
    }
    snapshot.remove();
  }, []);

  return null;
}
