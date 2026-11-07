import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryItem } from "@/hooks/useAgentMemory";
import { withTestQuery } from "@/test/withTestQuery";
import { AgentLearningTab } from "./AgentLearningTab";

const requests = vi.hoisted((): Array<Array<[string, unknown]>> => []);

vi.mock("@/pages/CarmenInsights", () => ({ CarmenInsights: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => new MemoryQuery() },
}));

beforeEach(() => requests.splice(0));

describe("AgentLearningTab subcategory selection", () => {
  it("renders producer names and selects the exact named subcategory", async () => {
    const user = userEvent.setup();
    render(
      withTestQuery(
        <AgentLearningTab agent={{ id: "agent-1", name: "Research" }} />,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "לקוחות 3" }));
    expect(screen.getByRole("button", { name: "Alpha 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alpha 1" }));

    await waitFor(() => {
      expect(screen.getByText("Alpha memory")).toBeInTheDocument();
      expect(screen.queryByText("Beta memory")).not.toBeInTheDocument();
      expect(screen.queryByText("Root memory")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Alpha 1" })).toHaveClass(
      "bg-accent",
    );
    expect(requests).toContainEqual([
      ["agent_id", "agent-1"],
      ["category", "clients"],
      ["subcategory", "Alpha"],
    ]);

    await user.click(screen.getByRole("button", { name: "Beta 1" }));
    await waitFor(() =>
      expect(screen.getByText("Beta memory")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Alpha memory")).not.toBeInTheDocument();
    expect(requests).toContainEqual([
      ["agent_id", "agent-1"],
      ["category", "clients"],
      ["subcategory", "Beta"],
    ]);
  });

  it("keeps root rows in category/all views without inventing a root subcategory", async () => {
    const user = userEvent.setup();
    render(
      withTestQuery(
        <AgentLearningTab agent={{ id: "agent-1", name: "Research" }} />,
      ),
    );

    await user.click(await screen.findByRole("button", { name: "לקוחות 3" }));
    expect(
      screen.queryByRole("button", { name: /__root__|—/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alpha 1" }));
    await waitFor(() =>
      expect(screen.queryByText("Root memory")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "לקוחות 3" }));
    await waitFor(() =>
      expect(screen.getByText("Root memory")).toBeInTheDocument(),
    );
    expect(screen.getByText("Alpha memory")).toBeInTheDocument();
    expect(screen.getByText("Beta memory")).toBeInTheDocument();
    expect(requests).toContainEqual([
      ["agent_id", "agent-1"],
      ["category", "clients"],
    ]);

    await user.click(screen.getByRole("button", { name: "הכל" }));
    expect(screen.getByText("Root memory")).toBeInTheDocument();
    expect(requests).toContainEqual([["agent_id", "agent-1"]]);
  });
});

const rows: Array<MemoryItem> = [
  memory("alpha", "Alpha", "Alpha memory"),
  memory("beta", "Beta", "Beta memory"),
  memory("root", null, "Root memory"),
];

type MemoryResult = { data: Array<MemoryItem>; error: null };

/** Supply stored rows to the real memory hooks and their tree builder. */
class MemoryQuery implements PromiseLike<MemoryResult> {
  private filters: Array<[string, unknown]> = [];

  select() {
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  then<TResult1 = MemoryResult, TResult2 = never>(
    fulfilled?:
      ((value: MemoryResult) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    requests.push([...this.filters]);
    const data = rows.filter((row) =>
      this.filters.every(([column, value]) =>
        column === "agent_id"
          ? value === "agent-1"
          : column === "category"
            ? row.category === value
            : row.subcategory === value,
      ),
    );
    return Promise.resolve({ data, error: null }).then(fulfilled, rejected);
  }
}

/** Keep complete persisted memory fixtures for the actual list rendering. */
function memory(
  id: string,
  subcategory: string | null,
  title: string,
): MemoryItem {
  return {
    id,
    category: "clients",
    subcategory,
    title,
    summary: null,
    path: null,
    importance: 0,
    created_at: "2026-11-01T10:00:00Z",
  };
}
