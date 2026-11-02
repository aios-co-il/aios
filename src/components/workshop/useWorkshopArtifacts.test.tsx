import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { useWorkshopArtifacts } from "./useWorkshopArtifacts";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/marketing/departments/creative/videoScenesStore", () => ({
  signCreativeVideoPaths: async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `https://signed/${path}`])),
}));
vi.mock("@/integrations/supabase/client", () => {
  const query = () => {
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "in", "delete"])
      chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: mocks.rows, error: null });
    return chain;
  };
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: query,
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

const page = (id: string, url: string) => ({
  id,
  item_id: "p-1",
  kind: "scene_still",
  folder: "video/scenes",
  title: "סצנה 1",
  status: "ready",
  url,
  thumb_url: url,
  meta: {},
  created_at: "2026-10-27T10:00:00Z",
});

test("a scene page of the user's own upload shows it through a signed link", async () => {
  // workshop_edit_from_assets keeps the upload's address in the private entity-attachments bucket.
  mocks.rows = [
    page(
      "a1",
      "https://p.supabase.co/storage/v1/object/public/entity-attachments/t-1/workshop/p-1/skin.png",
    ),
    page("a2", "t-1/c/p-1/s2/still-v1.png"),
  ];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useWorkshopArtifacts("t-1", "p-1"), {
    wrapper,
  });
  await waitFor(() => expect(result.current.data).toHaveLength(2));
  const [upload, still] = result.current.data!;
  expect(upload.url).toBe(
    "https://signed/entity-attachments/t-1/workshop/p-1/skin.png",
  );
  expect(upload.thumb_url).toBe(upload.url);
  expect(still.url).toBe("https://signed/t-1/c/p-1/s2/still-v1.png");
});
