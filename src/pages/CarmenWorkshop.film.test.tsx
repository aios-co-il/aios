import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import { getWorkshopContext } from "@/lib/workshopBridge";
import CarmenWorkshop from "./CarmenWorkshop";

// The open board's film: the aspect its storyboard is drawn at, and the layout scene-text saves
// write the storyboard page in (payload.workshop_edit), on every render of the board.

const film = (tenantId: string, payload: Record<string, unknown>) => ({
  id: "p-1",
  tenant_id: tenantId,
  status: "draft",
  title: "סרט",
  client_id: null,
  payload: { workshop: { kind: "film" }, ...payload },
});

const state = vi.hoisted(() => ({
  /** marketing_work_items of every tenant. */
  items: [] as Record<string, unknown>[],
  aspects: [] as string[],
  edits: [] as boolean[],
}));

vi.mock("@/integrations/supabase/client", () => {
  // A read by id answers with the first row of that id, whatever its tenant, unless filtered.
  const from = () => {
    let rows = state.items;
    const chain: Record<string, unknown> = { select: () => chain };
    chain.eq = chain.neq = (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return chain;
    };
    chain.maybeSingle = () =>
      Promise.resolve({ data: rows[0] ?? null, error: null });
    return chain;
  };
  // workshop_list_projects: the tenant's rows, with the film's format and edit flag.
  const rpc = (_name: string, args: { p_tenant_id: string }) =>
    Promise.resolve({
      data: state.items
        .filter((row) => row.tenant_id === args.p_tenant_id)
        .map((row) => {
          const payload = row.payload as Record<string, unknown>;
          return {
            ...row,
            has_board: true,
            format: payload.format ?? null,
            workshop_edit: payload.workshop_edit === true,
          };
        }),
      error: null,
    });
  return { supabase: { from, rpc } };
});
vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenant: { id: "t-1" } }),
}));
vi.mock("@/contexts/CommandCenterSidecarContext", () => ({
  useCommandCenterSidecar: () => ({ setOpen: vi.fn() }),
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
  useWorkshopScenes: () => ({ data: [], isLoading: false }),
  useEditSceneText: (_t: unknown, projectId: string | null, edit = false) => {
    if (projectId) state.edits.push(edit);
    return { mutateAsync: vi.fn() };
  },
}));
vi.mock("@/components/workshop/WorkshopFeed", () => ({
  WorkshopFeed: (props: {
    projectId: string | null;
    storyboard: { aspect: string };
  }) => {
    if (props.projectId) state.aspects.push(props.storyboard.aspect);
    return null;
  },
}));

beforeEach(() => {
  state.aspects = [];
  state.edits = [];
});

/** Every aspect and edit flag the board was set up with, once its reads have landed. */
async function openBoard() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CarmenWorkshop />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(getWorkshopContext()?.projectId).toBe("p-1"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { aspects: new Set(state.aspects), edits: new Set(state.edits) };
}

test("a 16:9 film is drawn at 16:9 from the board's first render", async () => {
  state.items = [film("t-1", { format: "16:9" })];
  expect((await openBoard()).aspects).toStrictEqual(new Set(["16:9"]));
});

test("a film cut from the user's materials never saves scene text in the plain layout", async () => {
  // With edit=false the storyboard page would get frame text these films do not show.
  state.items = [film("t-1", { workshop_edit: true })];
  expect((await openBoard()).edits).toStrictEqual(new Set([true]));
});

test("the board takes its film from its own tenant's project", async () => {
  // Another tenant's row with the same id comes first: its format and edit flag stay out.
  state.items = [
    film("t-2", { format: "16:9", workshop_edit: true }),
    film("t-1", {}),
  ];
  expect(await openBoard()).toStrictEqual({
    aspects: new Set(["9:16"]),
    edits: new Set([false]),
  });
});
