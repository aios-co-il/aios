import { act } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { preserveLegalPrerender } from "./preserveLegalPrerender";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LEGAL_PAGES, PRIVACY_PAGE } from "./legalPages";
import { PrerenderHandoff } from "./PrerenderHandoff";
import { renderLegalPage } from "./prerender";

describe("legal prerender handoff", () => {
  test.each(LEGAL_PAGES)(
    "keeps $path visible until its lazy route commits",
    async (page) => {
      window.history.replaceState(null, "", page.path);
      const container = document.createElement("div");
      container.id = "root";
      container.innerHTML = renderLegalPage(page.path);
      document.body.appendChild(container);
      const original = container.firstChild;
      let resolvePage: (value: {
        default: () => JSX.Element;
      }) => void = () => {};
      const Page = lazy(
        () =>
          new Promise<{ default: () => JSX.Element }>((resolve) => {
            resolvePage = resolve;
          }),
      );
      preserveLegalPrerender(container);
      const root = createRoot(container);
      try {
        await act(async () => {
          root.render(
            <Suspense fallback={<p>Loading</p>}>
              <PrerenderHandoff />
              <Page />
            </Suspense>,
          );
        });
        expect(document.getElementById("legal-prerender")?.firstChild).toBe(
          original,
        );
        expect(container.hidden).toBe(true);
        await act(async () => {
          resolvePage({ default: () => <p>Client policy</p> });
        });
        expect(document.getElementById("legal-prerender")).toBeNull();
        expect(container.hidden).toBe(false);
        expect(container.textContent).toBe("Client policy");
      } finally {
        await act(async () => root.unmount());
        document.getElementById("legal-prerender")?.remove();
        container.remove();
        window.history.replaceState(null, "", "/");
      }
    },
  );

  test("shows the error fallback when the legal route fails to load", async () => {
    window.history.replaceState(null, "", PRIVACY_PAGE.path);
    const container = document.createElement("div");
    container.id = "root";
    container.innerHTML = renderLegalPage(PRIVACY_PAGE.path);
    document.body.appendChild(container);
    const BrokenPage = lazy(() => Promise.reject(new Error("route failed")));
    preserveLegalPrerender(container);
    const root = createRoot(container);
    try {
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

      expect(container.hidden).toBe(false);
      expect(document.getElementById("legal-prerender")).toBeNull();
      expect(container.textContent).toContain("route failed");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.history.replaceState(null, "", "/");
    }
  });

  test("leaves an empty SPA root visible", () => {
    const root = document.createElement("div");
    preserveLegalPrerender(root);
    expect(root.hidden).toBe(false);
    expect(document.getElementById("legal-prerender")).toBeNull();
  });
});
