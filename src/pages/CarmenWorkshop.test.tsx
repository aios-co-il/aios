import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { StoryboardGrid } from "@/components/workshop/StoryboardGrid";
import { storyboardScenes } from "@/components/workshop/storyboardScenes";
import {
  getWorkshopContext,
  subscribeComposerPrefill,
  workshopRequestParts,
} from "@/lib/workshopBridge";
import CarmenWorkshop from "./CarmenWorkshop";

const state = vi.hoisted(() => ({
  setOpen: vi.fn(),
  scenes: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const rows = [
    {
      id: "p-1",
      title: "סרט כרמן",
      client_id: null,
      payload: { format: "9:16" },
    },
  ];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "neq", "order", "limit", "in"])
    chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  return { supabase: { from: () => chain, rpc: vi.fn() } };
});
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenant: { id: "t-1" } }),
}));
vi.mock("@/contexts/CommandCenterSidecarContext", () => ({
  useCommandCenterSidecar: () => ({ setOpen: state.setOpen }),
}));
vi.mock("@/components/carmen-command/access", () => ({
  useCommandCenterAccess: () => ({ allowed: true, loading: false }),
}));
vi.mock("@/components/marketing/ClientSelector", () => ({
  ClientSelector: () => null,
}));
vi.mock("@/components/workshop/useWorkshopArtifacts", () => ({
  useWorkshopArtifacts: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/components/workshop/useWorkshopScenes", () => ({
  useWorkshopScenes: () => ({ data: state.scenes, isLoading: false }),
  useEditSceneText: () => ({ mutateAsync: vi.fn() }),
}));
// The board itself: the storyboard grid it was given, and one page to pick.
vi.mock("@/components/workshop/WorkshopFeed", () => ({
  WorkshopFeed: (props: {
    storyboard?: Parameters<typeof StoryboardGrid>[0];
    onSelect: (id: string | null) => void;
  }) => (
    <div>
      <button type="button" onClick={() => props.onSelect("a-1")}>
        עמוד
      </button>
      {props.storyboard ? <StoryboardGrid {...props.storyboard} /> : null}
    </div>
  ),
}));

const scene = (id: string, position: number) => ({
  id,
  position,
  title: `סקין ${position}`,
  overlay_text: "",
  voiceover_text: "",
  motion_prompt: "",
  duration_s: 3,
  status: "draft",
  still_asset_id: null,
  clip_asset_id: null,
  clip_stale: false,
  meta: {},
});

beforeEach(() => {
  state.scenes = storyboardScenes([scene("s1", 1), scene("s2", 2)], new Map());
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CarmenWorkshop />
    </QueryClientProvider>,
  );
}

test("the scene picked on the board is the one Carmen is told about", async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole("button", { name: /^סצנה 2:/ }));
  await waitFor(() =>
    expect(getWorkshopContext()).toMatchObject({
      projectId: "p-1",
      selectedSceneId: "s2",
      selectedSceneNumber: 2,
    }),
  );
  expect(workshopRequestParts(getWorkshopContext())!.promptAddon).toContain(
    "scene_id=s2 (סצנה 2)",
  );

  // Picking a page lets go of the scene, and the other way round.
  await user.click(screen.getByRole("button", { name: "עמוד" }));
  await waitFor(() =>
    expect(getWorkshopContext()).toMatchObject({
      selectedArtifactId: "a-1",
      selectedSceneId: null,
      selectedSceneNumber: null,
    }),
  );
  await user.click(screen.getByRole("button", { name: /^סצנה 1:/ }));
  await waitFor(() =>
    expect(getWorkshopContext()).toMatchObject({
      selectedArtifactId: null,
      selectedSceneId: "s1",
    }),
  );

  fireEvent.keyDown(document.body, { key: "Escape" });
  await waitFor(() => expect(getWorkshopContext()?.selectedSceneId).toBe(null));
});

test("asking for a change picks the scene, opens Carmen and writes the scene in her composer", async () => {
  const user = userEvent.setup();
  const heard: string[] = [];
  const stop = subscribeComposerPrefill((text) => heard.push(text));
  renderPage();
  const card = (
    await screen.findByRole("button", { name: /^סצנה 2:/ })
  ).closest("article")!;
  state.setOpen.mockClear();
  await user.click(within(card).getByRole("button", { name: /בקשי שינוי/ }));
  stop();
  expect(heard).toStrictEqual(["סצנה 2: "]);
  expect(state.setOpen).toHaveBeenCalledWith(true);
  await waitFor(() => expect(getWorkshopContext()?.selectedSceneId).toBe("s2"));
  expect(screen.getByRole("button", { name: /^סצנה 2:/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
