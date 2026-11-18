import { act } from "@testing-library/react";
import { lazy, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PRIVACY_PAGE } from "./legalPages";
import { PrerenderHandoff } from "./PrerenderHandoff";
import { renderLegalPage } from "./prerender";
import { preserveLegalPrerender } from "./preserveLegalPrerender";

/** Mounts /privacy as the static snapshot with a route that fails with `error`. */
export function mountFailingPrivacyRoute(error: Error) {
  window.history.replaceState(null, "", PRIVACY_PAGE.path);
  const container = document.createElement("div");
  container.id = "root";
  container.innerHTML = renderLegalPage(PRIVACY_PAGE.path);
  document.body.appendChild(container);
  const BrokenPage = lazy(() => Promise.reject(error));
  preserveLegalPrerender(container);

  return { container, root: createRoot(container), BrokenPage };
}

export async function renderBoundary(root: Root, BrokenPage: ComponentType) {
  await act(async () => {
    root.render(
      <ErrorBoundary>
        <Suspense fallback={<p>Loading</p>}>
          <PrerenderHandoff />
          <BrokenPage />
        </Suspense>
      </ErrorBoundary>,
    );
  });
}

export async function cleanUp(root: Root, container: HTMLElement) {
  await act(async () => root.unmount());
  document.getElementById("legal-prerender")?.remove();
  container.remove();
  window.history.replaceState(null, "", "/");
}
