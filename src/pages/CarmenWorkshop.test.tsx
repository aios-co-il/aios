import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { StoryboardGrid } from "@/components/workshop/StoryboardGrid";
import { storyboardScenes } from "@/components/workshop/storyboardScenes";
import {
  getWorkshopContext,
  subscribeComposerPrefill,
  workshopRequestParts,
} from "@/lib/workshopBridge";
import CarmenWorkshop from "./CarmenWorkshop";

const workshopProject = {
  id: "p-1",
  tenant_id: "t-1",
  status: "draft",
  title: "סרט כרמן",
  client_id: null,
  payload: { format: "9:16", workshop: { kind: "film" } },
};

const state = vi.hoisted(() => ({
  setOpen: vi.fn(),
  scenes: [] as unknown[],
  /** marketing_work_items, newest first, as the query orders them. */
  items: [] as Record<string, unknown>[],
  clients: [] as Record<string, unknown>[],
}));

vi.mock("@/integrations/supabase/client", () => {
  // A small PostgREST: eq, neq and not(...is null) filter the rows; "a->b" reads a JSON key.
  const valueAt = (row: Record<string, unknown>, column: string) =>
    column
      .split("->")
      .reduce<unknown>(
        (value, key) =>
          value && typeof value === "object"
            ? (value as Record<string, unknown>)[key]
            : undefined,
        row,
      );
  const from = (table: string) => {
    let rows = table === "clients" ? state.clients : state.items;
    const chain: Record<string, unknown> = {};
    for (const name of ["select", "order", "limit", "in"])
      chain[name] = () => chain;
    chain.eq = (column: string, value: unknown) => {
      rows = rows.filter((row) => valueAt(row, column) === value);
      return chain;
    };
    chain.neq = (column: string, value: unknown) => {
      rows = rows.filter((row) => valueAt(row, column) !== value);
      return chain;
    };
    chain.not = (column: string, operator: string, value: unknown) => {
      if (operator === "is" && value === null)
        rows = rows.filter((row) => valueAt(row, column) != null);
      return chain;
    };
    chain.maybeSingle = () =>
      Promise.resolve({ data: rows[0] ?? null, error: null });
    chain.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    return chain;
  };
  // workshop_list_projects: every marketing item of the tenant, a board where payload.workshop is.
  const rpc = (name: string, args: { p_tenant_id: string }) =>
    Promise.resolve({
      data:
        name === "workshop_list_projects"
          ? state.items
              .filter((row) => row.tenant_id === args.p_tenant_id)
              .map((row) => {
                const payload = (row.payload ?? {}) as Record<string, unknown>;
                return {
                  ...row,
                  client_name: null,
                  department_hint: payload.department ?? null,
                  has_board: payload.workshop != null,
                  format: payload.format ?? null,
                  workshop_edit: payload.workshop_edit === true,
                };
              })
          : null,
      error: null,
    });
  return { supabase: { from, rpc } };
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
  state.items = [workshopProject];
  state.clients = [];
});

function renderPage(path = "/") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <CarmenWorkshop />
      </QueryClientProvider>
    </MemoryRouter>,
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

test("the board opens the newest workshop project, never another marketing item", async () => {
  // A copy item edited a minute ago in /marketing shares the table but is no workshop project.
  state.items = [
    {
      id: "copy-1",
      tenant_id: "t-1",
      status: "draft",
      title: "קופי לדף נחיתה",
      client_id: null,
      payload: { department: "copy" },
    },
    workshopProject,
  ];
  renderPage();
  await waitFor(() =>
    expect(getWorkshopContext()).toMatchObject({
      projectId: "p-1",
      title: "סרט כרמן",
    }),
  );
  expect(screen.queryByText("קופי לדף נחיתה")).toBeNull();
});

const COPY_ID = "c0ffee00-0000-4000-8000-000000000001";

test("a project of any department opens on the board with Carmen, not in its department screen", async () => {
  state.items = [
    {
      id: COPY_ID,
      tenant_id: "t-1",
      status: "draft",
      title: "קופי לדף נחיתה",
      client_id: null,
      payload: { department: "copy" },
    },
    workshopProject,
  ];
  renderPage(`/?project=${COPY_ID}`);
  await waitFor(() =>
    expect(getWorkshopContext()).toMatchObject({
      projectId: COPY_ID,
      title: "קופי לדף נחיתה",
    }),
  );
  expect(screen.queryByText("פתח במסך המחלקה")).toBeNull();
  expect(screen.queryByText(/אין לוח בסדנה/)).toBeNull();
});

const CLIENT = "c0000000-0000-4000-8000-000000000001";
test.each([
  ["an active client of the tenant", "t-1", "active", CLIENT, "פיצה"],
  // Outside the client picker: handled as an unknown client, so Carmen starts nothing for it.
  ["a paused client", "t-1", "paused", null, null],
  ["another tenant's client", "t-2", "active", null, null],
])("%s in the URL: the client Carmen is told about", async (...cell) => {
  const [, tenant_id, status, clientId, clientName] = cell;
  state.clients = [{ id: CLIENT, tenant_id, status, name: "פיצה" }];
  renderPage(`/?client=${CLIENT}`);
  await waitFor(() =>
    expect(getWorkshopContext()).toMatchObject({ clientId, clientName }),
  );
});
