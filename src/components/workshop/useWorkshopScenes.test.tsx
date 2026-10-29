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
  /** The newest storyboard page of the project, and what was written to pages. */
  page: null as null | { id: string; meta: Record<string, unknown> },
  pageWrites: [] as { meta: Record<string, unknown> }[],
  /** The scenes' still and clip assets. */
  assets: [] as { id: string; url: string }[],
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/components/marketing/departments/creative/videoScenesStore", () => ({
  signCreativeVideoPaths: async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `https://signed/${path}`])),
}));
vi.mock("@/integrations/supabase/client", () => {
  const query = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "in", "limit"])
      chain[name] = () => chain;
    chain.maybeSingle = async () => ({ data: mocks.page, error: null });
    chain.update = (value: { meta: Record<string, unknown> }) => {
      if (table === "workshop_artifacts") mocks.pageWrites.push(value);
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({
        data: table === "marketing_assets" ? mocks.assets : mocks.rows,
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
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://signed/${bucket}/${path}` },
            error: null,
          }),
        }),
      },
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
  mocks.page = null;
  mocks.pageWrites = [];
  mocks.assets = [{ id: "c1", url: "tenant/item/clip.mp4" }];
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
    emitWorkshopEvent({ event: "artifacts", item_id: "p-1", scene_id: "s1" }),
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

test("a scene of the user's own upload shows it through a signed link", async () => {
  // workshop_edit_from_assets keeps the upload's address in the private entity-attachments bucket.
  mocks.assets = [
    {
      id: "c1",
      url: "https://p.supabase.co/storage/v1/object/public/entity-attachments/t-1/workshop/p-1/intro.mp4",
    },
  ];
  const { result } = renderHook(() => useWorkshopScenes("t-1", "p-1"), {
    wrapper,
  });
  await waitFor(() =>
    expect(result.current.data?.[0]?.clipUrl).toBe(
      "https://signed/entity-attachments/t-1/workshop/p-1/intro.mp4",
    ),
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
  // The texts left out are not sent: the function's null default keeps them.
  const [name, args] = mocks.rpc.mock.calls[0];
  expect(name).toBe("workshop_edit_scene_text");
  expect(JSON.parse(JSON.stringify(args))).toStrictEqual({
    p_scene_id: "s1",
    p_overlay_text: "חדש",
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

test("an edit refused while the film is produced says so", async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    // workshop_edit_scene_text's refusal (object_in_use) while the production runs.
    error: { code: "55006", message: "the film is being produced" },
  });
  const { result } = renderHook(() => useEditSceneText("t-1", "p-1"), {
    wrapper,
  });
  await act(async () => {
    await result.current
      .mutateAsync({ sceneId: "s1", patch: { voiceover_text: "חדש" } })
      .catch(() => {});
  });
  expect(mocks.toastError).toHaveBeenCalledWith(
    "הסרט בהפקה עכשיו. אפשר לשנות את הטקסט כשההפקה מסתיימת.",
  );
});

test("a saved text also brings the storyboard page up to date", async () => {
  mocks.page = {
    id: "page-1",
    meta: {
      scenes: [
        {
          id: "s1",
          position: 1,
          title: "ההוק",
          duration_s: 3,
          overlay_text: "ישן",
          lipsync: true,
          dialogue: "שורה ישנה",
        },
      ],
      text: "1. ההוק (3 ש׳)\nכיתוב: ישן\nאומרת למצלמה: שורה ישנה",
    },
  };
  mocks.rpc.mockResolvedValue({
    data: {
      ...row("s1", "חדש"),
      meta: { lipsync: true, dialogue: "שורה חדשה" },
    },
    error: null,
  });
  const { result } = renderHook(() => useEditSceneText("t-1", "p-1", true), {
    wrapper,
  });
  await act(async () => {
    await result.current.mutateAsync({
      sceneId: "s1",
      patch: { overlay_text: "חדש", dialogue: "שורה חדשה" },
    });
  });
  expect(mocks.pageWrites).toHaveLength(1);
  expect(mocks.pageWrites[0].meta.text).toBe(
    "1. ההוק (3 ש׳)\nכיתוב: חדש\nאומרת למצלמה: שורה חדשה",
  );
});
