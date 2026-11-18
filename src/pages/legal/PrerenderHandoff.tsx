import { useLayoutEffect } from "react";
import { revealPrerenderedApp } from "./preserveLegalPrerender";

/** Inside Suspense, this effect runs only once the route can be displayed. */
export function PrerenderHandoff() {
  useLayoutEffect(revealPrerenderedApp, []);

  return null;
}
