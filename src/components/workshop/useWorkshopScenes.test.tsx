import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { emitWorkshopEvent } from "@/lib/workshopBridge";
import { storyboardScenes, type StoryboardScene } from "./storyboardScenes";
import {
  scenesQueryKey,
  useEditSceneText,
  useWorkshopScenes,
} from "./useWorkshopScenes";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastError: vi.fn(),
  rows: [] as unknown[],
  realtime: null as null | (() => void),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/components/marketing/departments/creative/videoScenesStore", () => ({
  signCreativeVideoPaths: async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `https://signed/${path}`])),
}));
vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "in"])
      chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({
        data:
          table === "marketing_assets"
            ? [{ id: "c1", url: "tenant/item/clip.mp4" }]
            : mocks.rows,
        error: null,
      });
    return chain;
  };
  const channel = {
    on: (_kind: string, _filter: unknown, listener: () => void) => {
      mocks.realtime = listener;
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: query,
      rpc: mocks.rpc,
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  };
});

const row = (id: string, overlay: string) => ({
  id,
  position: 1,
  title: "ההוק",
  overlay_text: overlay,
  voiceover_text: "",
  motion_prompt: "",
  duration_s: 3,
  status: "clip_ready",
  still_asset_id: null,
  clip_asset_id: "c1",
  clip_stale: false,
  meta: {},
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.rows = [row("s1", "ישן")];
});

test("the grid reads the scenes, signs clip paths and reloads when Carmen changes one", async () => {
  const { result } = renderHook(() => useWorkshopScenes("t-1", "p-1"), {
    wrapper,
  });
  await waitFor(() =>
    expect(result.current.data?.[0]?.overlayText).toBe("ישן"),
  );
  expect(result.current.data?.[0]?.clipUrl).toBe(
    "https://signed/tenant/item/clip.mp4",
  );

  mocks.rows = [row("s1", "מה Carmen כתבה")];
  act(() =>
    emitWorkshopEvent({ event: "scenes", item_id: "p-1", scene_id: "s1" }),
  );
  await waitFor(() =>
    expect(result.current.data?.[0]?.overlayText).toBe("מה Carmen כתבה"),
  );

  mocks.rows = [row("s1", "מהעובד")];
  act(() => mocks.realtime?.());
  await waitFor(() =>
    expect(result.current.data?.[0]?.overlayText).toBe("מהעובד"),
  );
});

test("a saved text shows at once; a failed save puts the old text back and says so", async () => {
  const key = scenesQueryKey("t-1", "p-1");
  const scenes = storyboardScenes([row("s1", "ישן")], new Map());
  client.setQueryData(key, scenes);
  let fail!: (error: unknown) => void;
  mocks.rpc.mockReturnValue(
    new Promise((resolve) => {
      fail = (error) => resolve({ error });
    }),
  );
  const { result } = renderHook(() => useEditSceneText("t-1", "p-1"), {
    wrapper,
  });

  let saving!: Promise<unknown>;
  act(() => {
    saving = result.current
      .mutateAsync({ sceneId: "s1", patch: { overlay_text: "חדש" } })
      .catch((error) => error);
  });
  await waitFor(() =>
    expect(client.getQueryData<StoryboardScene[]>(key)?.[0].overlayText).toBe(
      "חדש",
    ),
  );
  expect(mocks.rpc).toHaveBeenCalledWith("workshop_edit_scene_text", {
    p_scene_id: "s1",
    p_overlay_text: "חדש",
    p_voiceover_text: null,
    p_dialogue: null,
  });

  await act(async () => {
    fail({ message: "permission denied" });
    await saving;
  });
  expect(client.getQueryData<StoryboardScene[]>(key)?.[0].overlayText).toBe(
    "ישן",
  );
  expect(mocks.toastError).toHaveBeenCalledWith(
    "לא הצלחנו לשמור את הטקסט של הסצנה",
  );
});
