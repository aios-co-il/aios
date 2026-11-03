import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { withTestQuery } from "@/test/withTestQuery";
import type { FlowNodeData } from "./FlowNode";
import { StepConfigPanel } from "./StepConfigPanel";

describe("StepConfigPanel Green API connection choices", () => {
  it("keeps the owned connection selectable beside an ownerless connection", async () => {
    backend.integrations[0].user_id = null;
    const onUpdate = vi.fn();
    const { queryClient, wrapper } = withTestQuery();
    render(
      <StepConfigPanel
        node={node}
        open
        onClose={vi.fn()}
        onUpdate={onUpdate}
      />,
      { wrapper },
    );
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    const selector = screen.getByText("חיבור Green API").parentElement;
    if (!selector) throw new Error("Missing connection selector");
    await userEvent.click(within(selector).getByRole("combobox"));
    expect(
      screen.queryByRole("option", { name: "חיבור one" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "חיבור two" }));
    expect(onUpdate).toHaveBeenCalledWith(node.id, {
      configuration: { connection_user_id: "u2" },
    });
  });

  it("retains the selector when multiple connections have owners", async () => {
    const { queryClient, wrapper } = withTestQuery();
    render(
      <StepConfigPanel node={node} open onClose={vi.fn()} onUpdate={vi.fn()} />,
      { wrapper },
    );
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.getByText("חיבור Green API")).toBeInTheDocument();
  });
});

type Integration = Pick<
  Database["public"]["Tables"]["tenant_integrations"]["Row"],
  "id" | "user_id" | "settings" | "instance_id" | "is_active"
>;
type QueryResult = { data: Array<Integration>; error: null };

const backend = vi.hoisted((): { integrations: Array<Integration> } => ({
  integrations: [],
}));
const node: FlowNodeData = {
  id: "trigger-1",
  step_type: "trigger",
  action_type: "whatsapp_message_received",
  configuration: {},
  position_x: 0,
  position_y: 0,
  sort_order: 0,
};

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenant: { id: "tenant-1" } }),
}));
vi.mock("@/hooks/useTenantPath", () => ({
  useTenantPath: () => ({ buildPath: (path: string) => path }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: async () => ({ data: [], error: null }),
      then: (resolve: (result: QueryResult) => unknown) =>
        Promise.resolve({
          data: table === "tenant_integrations" ? backend.integrations : [],
          error: null,
        }).then(resolve),
    }),
  },
}));

beforeAll(() => {
  Object.assign(HTMLElement.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
  });
});

beforeEach(() => {
  backend.integrations = [
    {
      id: "i1",
      user_id: "u1",
      settings: {},
      instance_id: "one",
      is_active: true,
    },
    {
      id: "i2",
      user_id: "u2",
      settings: {},
      instance_id: "two",
      is_active: true,
    },
  ];
});
