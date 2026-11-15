import { useEffect } from "react";

/**
 * Keeps search engines off the page while it is mounted. vercel.json also
 * sends X-Robots-Tag for /unsubscribe/*, for crawlers that skip JavaScript.
 */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}
