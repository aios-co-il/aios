import { describe, expect, test, vi } from "vitest";
import { CHUNK_RELOAD_KEY } from "@/components/ErrorBoundary";
import {
  cleanUp,
  mountFailingPrivacyRoute,
  renderBoundary,
} from "./failingLegalRoute.fixture";

describe("legal prerender handoff when the route fails", () => {
  test("shows the error fallback when the legal route fails to load", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));
    const { container, root, BrokenPage } = mountFailingPrivacyRoute(
      new Error("route failed"),
    );
    try {
      await renderBoundary(root, BrokenPage);

      expect(container.hidden).toBe(false);
      expect(document.getElementById("legal-prerender")).toBeNull();
      expect(container.textContent).toContain("route failed");
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    } finally {
      await cleanUp(root, container);
      fetchSpy.mockRestore();
    }
  });

  test("keeps the policy readable when the route chunk fails again", async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    const { container, root, BrokenPage } = mountFailingPrivacyRoute(
      new Error(
        "Failed to fetch dynamically imported module: /assets/Privacy.js",
      ),
    );
    try {
      await renderBoundary(root, BrokenPage);

      expect(container.hidden).toBe(true);
      expect(document.getElementById("legal-prerender")).not.toBeNull();
    } finally {
      await cleanUp(root, container);
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    }
  });

  test("keeps the policy readable while a chunk reload is on its way", async () => {
    chunkState.reloadPending = true;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));
    const { container, root, BrokenPage } = mountFailingPrivacyRoute(
      new TypeError("Cannot read properties of undefined (reading 'default')"),
    );
    try {
      await renderBoundary(root, BrokenPage);

      expect(container.hidden).toBe(true);
      expect(document.getElementById("legal-prerender")).not.toBeNull();
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    } finally {
      await cleanUp(root, container);
      chunkState.reloadPending = false;
      fetchSpy.mockRestore();
    }
  });
});

const chunkState = vi.hoisted(() => ({ reloadPending: false }));

vi.mock("@/lib/chunkErrors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chunkErrors")>()),
  isChunkReloadPending: () => chunkState.reloadPending,
}));
