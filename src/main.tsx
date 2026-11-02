import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { isChunkLoadError } from "./lib/chunkErrors.ts";
import { supabase } from "./integrations/supabase/client.ts";

/** One-shot guard — unguarded reload() here caused infinite "jumping" after deploys. */
const MAIN_CHUNK_RELOAD_KEY = "aios-main-chunk-reload";

function reloadOnceForStaleChunk(): boolean {
  try {
    if (sessionStorage.getItem(MAIN_CHUNK_RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(MAIN_CHUNK_RELOAD_KEY, "1");
  } catch {
    // If storage is blocked, still attempt a single reload best-effort.
  }
  window.location.reload();
  return true;
}

// report-error requires a JWT, so send the session token like ErrorBoundary
// does; without it these reports were rejected and never logged.
const reportFrontendError = async (
  errorMessage: string,
  errorStack?: string,
) => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-error`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { apikey: key } : {}),
          Authorization: `Bearer ${session?.access_token ?? key}`,
        },
        body: JSON.stringify({
          source: "frontend",
          error_message: errorMessage,
          error_stack: errorStack,
          url: window.location.href,
        }),
      },
    );
  } catch {
    // ignore
  }
};

window.addEventListener("vite:preloadError", (event) => {
  void reportFrontendError(
    `Vite preload error: ${event.payload?.message || "unknown"}`,
    event.payload?.stack,
  );
  // Swallow the error only while a reload is on its way. Otherwise the lazy
  // route gets `undefined` and crashes with "reading 'default'", hiding the
  // file that failed to load.
  if (reloadOnceForStaleChunk()) event.preventDefault();
});

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason);
  void reportFrontendError(`Unhandled Promise: ${msg}`, event.reason?.stack);

  if (isChunkLoadError(event.reason)) {
    reloadOnceForStaleChunk();
  }
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
