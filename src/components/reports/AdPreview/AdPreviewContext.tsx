import { createContext, useContext } from "react";

/**
 * How the report reaches ad-preview: the internal page names its table (the
 * viewer's session decides access), a share link names its token.
 */
export type AdPreviewSource = { tableId: string } | { shareToken: string };

/** Null where the report has no ad previews. */
export const AdPreviewContext = createContext<AdPreviewSource | null>(null);

/** The report's ad preview source, or null without one. */
export function useAdPreviewSource(): AdPreviewSource | null {
  return useContext(AdPreviewContext);
}
