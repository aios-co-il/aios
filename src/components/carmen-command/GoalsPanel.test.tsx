import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getExecutionGoal,
  listExecutionGoals,
  runGoalIteration,
  type ExecutionGoal,
} from "@/lib/goalExecution";
import { createTestQueryHarness, withTestQuery } from "@/test/withTestQuery";
import { GoalsPanel } from "./GoalsPanel";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "fixture-token" } },
      })),
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("./panels", () => ({
  HudPanel: ({ children }: PropsWithChildren) => <section>{children}</section>,
}));

vi.mock("@/lib/goalExecution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/goalExecution")>()),
  getExecutionGoal: vi.fn(),
  listExecutionGoals: vi.fn(),
  runGoalIteration: vi.fn(),
}));

const goal: ExecutionGoal = {
  id: "fixture-goal-id",
  tenant_id: "fixture-tenant",
  title: "Fixture goal",
  status: "active",
  priority: "medium",
  execution_mode: true,
  autonomous_mode: true,
  engine_status: "PLANNING",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("GoalsPanel selected-goal actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listExecutionGoals).mockResolvedValue([goal]);
    vi.mocked(getExecutionGoal).mockResolvedValue({ goal });
    vi.mocked(runGoalIteration).mockResolvedValue({});
  });

  it("shows the empty-selection prompt without an iteration action", async () => {
    render(withTestQuery(<GoalsPanel tenantId="fixture-tenant" />));

    await screen.findByRole("button", { name: /Fixture goal/ });

    expect(screen.getByText("בחרי יעד לפרטים")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "הרץ איטרציה עכשיו" }),
    ).not.toBeInTheDocument();
    expect(getExecutionGoal).not.toHaveBeenCalled();
    expect(runGoalIteration).not.toHaveBeenCalled();
  });

  it("sends the selected goal ID unchanged when iteration is requested", async () => {
    const user = userEvent.setup();
    render(withTestQuery(<GoalsPanel tenantId="fixture-tenant" />));

    await user.click(
      await screen.findByRole("button", { name: /Fixture goal/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: "הרץ איטרציה עכשיו" }),
    );

    await waitFor(() => {
      expect(runGoalIteration).toHaveBeenCalledWith(
        "fixture-token",
        "fixture-tenant",
        "fixture-goal-id",
      );
    });
  });

  it("hides actions for explicitly synthetic null-key cached detail", async () => {
    const { wrapper, queryClient } = createTestQueryHarness();
    const detailKey = ["execution-goal-detail", "fixture-tenant", null];
    queryClient.setQueryData(detailKey, { goal });

    render(<GoalsPanel tenantId="fixture-tenant" />, { wrapper });
    await screen.findByRole("button", { name: /Fixture goal/ });

    expect(queryClient.getQueryData(detailKey)).toEqual({ goal });
    expect(screen.getByText("בחרי יעד לפרטים")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "הרץ איטרציה עכשיו" }),
    ).not.toBeInTheDocument();
    expect(getExecutionGoal).not.toHaveBeenCalled();
    expect(runGoalIteration).not.toHaveBeenCalled();
  });
});
