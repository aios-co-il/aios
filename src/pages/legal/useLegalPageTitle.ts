import { useEffect } from "react";
import { DEFAULT_DOCUMENT_TITLE, type LegalPage } from "./legalPages";

/**
 * Sets the tab title while a legal page is shown. The static HTML sets it on a
 * direct load; this keeps it right after client-side navigation.
 */
export function useLegalPageTitle(page: LegalPage): void {
  useEffect(() => {
    document.title = page.title;

    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [page.title]);
}
