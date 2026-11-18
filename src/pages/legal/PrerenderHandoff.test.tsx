import { act } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { preserveLegalPrerender } from "./preserveLegalPrerender";
import { LEGAL_PAGES } from "./legalPages";
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
      let resolvePage!: (value: { default: () => JSX.Element }) => void;
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

  test("leaves an empty SPA root visible", () => {
    const root = document.createElement("div");
    preserveLegalPrerender(root);
    expect(root.hidden).toBe(false);
    expect(document.getElementById("legal-prerender")).toBeNull();
  });
});
