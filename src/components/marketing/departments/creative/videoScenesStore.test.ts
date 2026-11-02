import { beforeEach, expect, test, vi } from "vitest";
import { saveVideoStoryboard } from "./videoScenesStore";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

beforeEach(() => {
  mocks.rpc.mockReset();
});

const save = () =>
  saveVideoStoryboard({
    tenantId: "t-1",
    itemId: "p-1",
    frames: [],
    persistedStills: new Map(),
  });

test("a storyboard save refused while the film is produced says so", async () => {
  // save_video_storyboard's lock (20261026103258): object_in_use while the film is produced.
  mocks.rpc.mockResolvedValue({
    data: null,
    error: {
      code: "55006",
      message: "save_video_storyboard: the film is being produced",
    },
  });
  await expect(save()).rejects.toThrow(
    "הסרט בהפקה עכשיו. אפשר לשנות את הסטוריבורד כשההפקה מסתיימת.",
  );
});

test("any other failed save keeps its own error", async () => {
  const error = { code: "42501", message: "permission denied" };
  mocks.rpc.mockResolvedValue({ data: null, error });
  await expect(save()).rejects.toBe(error);
});
