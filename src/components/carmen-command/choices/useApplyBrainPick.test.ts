import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  FALLBACK_BRAIN_ROUTES,
  type BrainRoute,
} from "@/lib/agentChannelRouting";
import type { FollowedPick } from "./brainPickDecision";
import { type PickableBrain, useApplyBrainPick } from "./useApplyBrainPick";

const modelBrain: BrainRoute = {
  id: "route-gpt",
  slug: "gpt-fast",
  label: "GPT",
  route_type: "model",
  provider: "model",
};
const routes = [...FALLBACK_BRAIN_ROUTES, modelBrain];

/** The route with this slug in the user's list. */
function route(slug: string): BrainRoute {
  const found = routes.find((candidate) => candidate.slug === slug);
  if (!found) {
    throw new Error(`no test route ${slug}`);
  }
  return found;
}

interface Scene {
  storedSlug: string | null;
  selectedSlug?: string;
  quiet?: boolean;
  picksReady?: boolean;
  picksSettled?: boolean;
  routesReady?: boolean;
  allowed?: Array<BrainRoute>;
}

/** Mounts the hook on a sidecar in the given state; `show` moves it to another. */
function mountSidecar(first: Scene) {
  const selectRoute = vi.fn();
  const followedRef: { current: FollowedPick } = { current: null };

  /** The sidecar's brain channel as the scene describes it. */
  function brainFor(scene: Scene): PickableBrain {
    return {
      routes: scene.allowed ?? routes,
      routesReady: scene.routesReady ?? true,
      selected: route(scene.selectedSlug ?? "cursor"),
      selectRoute,
      storedPick: {
        slug: scene.storedSlug,
        ready: scene.picksReady ?? true,
        settled: scene.picksSettled ?? true,
        followedRef,
      },
    };
  }

  const view = renderHook(
    (scene: Scene) =>
      useApplyBrainPick(brainFor(scene), "tenant-a", scene.quiet ?? true),
    { initialProps: first },
  );

  return { selectRoute, followedRef, show: view.rerender };
}

describe("useApplyBrainPick", () => {
  it("opens on Carmen's internal brain when the user stored no pick", () => {
    const { selectRoute } = mountSidecar({ storedSlug: null });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(route("internal"));
  });

  it("opens on the stored pick", () => {
    const { selectRoute } = mountSidecar({ storedSlug: "gpt-fast" });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(modelBrain);
  });

  it("opens on the internal brain when the stored pick is no longer granted", () => {
    const { selectRoute } = mountSidecar({
      storedSlug: "gpt-fast",
      allowed: FALLBACK_BRAIN_ROUTES,
    });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(route("internal"));
  });

  it("waits for both the brain list and the picks", () => {
    const { selectRoute, show } = mountSidecar({
      storedSlug: "gpt-fast",
      picksReady: false,
    });
    show({ storedSlug: "gpt-fast", routesReady: false });

    expect(selectRoute).not.toHaveBeenCalled();

    show({ storedSlug: "gpt-fast" });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(modelBrain);
  });

  it("selects nothing when the chat is already on the pick", () => {
    const { selectRoute, show } = mountSidecar({
      storedSlug: "gpt-fast",
      selectedSlug: "gpt-fast",
    });
    show({ storedSlug: "gpt-fast", selectedSlug: "gpt-fast" });

    expect(selectRoute).not.toHaveBeenCalled();
  });

  it("follows a pick made elsewhere while the chat is quiet", () => {
    const { selectRoute, show } = mountSidecar({
      storedSlug: "gpt-fast",
      selectedSlug: "gpt-fast",
    });

    show({ storedSlug: "grok", selectedSlug: "gpt-fast" });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(route("grok"));
  });

  it("holds a pick made elsewhere until the chat is quiet again", () => {
    const { selectRoute, show } = mountSidecar({
      storedSlug: "gpt-fast",
      selectedSlug: "gpt-fast",
    });

    show({ storedSlug: "grok", selectedSlug: "gpt-fast", quiet: false });

    expect(selectRoute).not.toHaveBeenCalled();

    show({ storedSlug: "grok", selectedSlug: "gpt-fast" });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(route("grok"));
  });

  it("returns to the pick in the next new chat after a reopened conversation", () => {
    const { selectRoute, followedRef, show } = mountSidecar({
      storedSlug: "gpt-fast",
      selectedSlug: "gpt-fast",
    });

    followedRef.current = null;
    show({ storedSlug: "gpt-fast", selectedSlug: "grok", quiet: false });

    expect(selectRoute).not.toHaveBeenCalled();

    show({ storedSlug: "gpt-fast", selectedSlug: "grok" });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(modelBrain);
    expect(followedRef.current).toEqual({
      tenantId: "tenant-a",
      slug: "gpt-fast",
    });
  });

  it("leaves a brain the user chose here alone, then follows what the row holds once the picks settled", () => {
    const { selectRoute, followedRef, show } = mountSidecar({
      storedSlug: "gpt-fast",
      selectedSlug: "gpt-fast",
    });
    const chosen = { selectedSlug: "grok", picksSettled: false };

    followedRef.current = { tenantId: "tenant-a", ownPick: true };
    show({ ...chosen, storedSlug: "gpt-fast" });
    show({ ...chosen, storedSlug: "cursor" });

    expect(selectRoute).not.toHaveBeenCalled();
    expect(followedRef.current).toEqual({
      tenantId: "tenant-a",
      ownPick: true,
    });

    show({ storedSlug: "cursor", selectedSlug: "grok" });

    expect(selectRoute).not.toHaveBeenCalled();
    expect(followedRef.current).toEqual({
      tenantId: "tenant-a",
      slug: "cursor",
    });

    show({ storedSlug: "gpt-fast", selectedSlug: "grok" });

    expect(selectRoute).toHaveBeenCalledExactlyOnceWith(modelBrain);
  });

  it("keeps the selection of a user granted neither the pick nor the internal brain", () => {
    const { selectRoute } = mountSidecar({
      storedSlug: "gpt-fast",
      allowed: [route("cursor")],
    });

    expect(selectRoute).not.toHaveBeenCalled();
  });
});
