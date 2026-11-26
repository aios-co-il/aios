import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { CardDraftsPage } from "./CardDraftsPage";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  dismiss: vi.fn(),
  owner: { current: true },
  rows: { current: [] as Array<unknown> },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "t1" }),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: mocks.rows.current, error: null }),
  };
  return {
    supabase: {
      from: () => query,
      functions: { invoke: mocks.invoke },
      rpc: mocks.rpc,
    },
  };
});

/** A live draft row as the findings read returns it. */
function row(id: string, shortCode: number, client: string, content: string) {
  return {
    id,
    short_code: shortCode,
    summary_he: `סיכום ${shortCode}`,
    client_id: `c-${id}`,
    last_seen_at: "2026-11-01T06:00:00Z",
    client: { name: client },
    evidence: {
      card_draft: {
        source: "group_digest",
        update_type: "group_summary",
        source_ref: `g:${id}`,
        content,
      },
    },
  };
}

describe("CardDraftsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner.current = true;
    mocks.rpc.mockImplementation((name: string, args: unknown) =>
      name === "carmen_manager_is_owner"
        ? Promise.resolve({ data: mocks.owner.current, error: null })
        : mocks.dismiss(name, args),
    );
    mocks.rows.current = [
      row("f1", 31, "אקמה", "[כרמן · סיכום קבוצה] אישר תקציב"),
      row("f2", 32, "בטא", "[כרמן · סיכום קבוצה] ביקש דוח"),
    ];
  });

  it("lists each draft with its client, code and the text approval writes", async () => {
    render(withTestQuery(<CardDraftsPage />));

    expect(await screen.findByText("אקמה")).toBeInTheDocument();
    expect(
      screen.getByText("[כרמן · סיכום קבוצה] אישר תקציב"),
    ).toBeInTheDocument();
    expect(screen.getByText(/#32/)).toBeInTheDocument();
  });

  it("approves the checked drafts through the edge function", async () => {
    mocks.invoke.mockResolvedValue({
      data: { results: [{ id: "f2", status: "approved" }] },
      error: null,
    });
    const user = userEvent.setup();
    render(withTestQuery(<CardDraftsPage />));

    await user.click(await screen.findByLabelText("בחירת עדכון #32"));
    await user.click(screen.getByRole("button", { name: "אשר נבחרים (1)" }));

    expect(mocks.invoke).toHaveBeenCalledWith("carmen-card-drafts-approve", {
      body: { tenant_id: "t1", finding_ids: ["f2"] },
    });
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "עדכון אחד נרשם בכרטיס הלקוח",
    );
  });

  it("approves a selection over the function's limit in batches", async () => {
    mocks.rows.current = Array.from({ length: 51 }, (_, i) =>
      row(`f${i}`, i, "אקמה", `טיוטה ${i}`),
    );
    mocks.invoke.mockImplementation(
      (_name: string, { body }: { body: { finding_ids: Array<string> } }) =>
        Promise.resolve({
          data: {
            results: body.finding_ids.map((id) => ({ id, status: "approved" })),
          },
          error: null,
        }),
    );
    const user = userEvent.setup();
    render(withTestQuery(<CardDraftsPage />));

    await user.click(await screen.findByLabelText("בחירת הכל"));
    await user.click(screen.getByRole("button", { name: "אשר נבחרים (51)" }));

    expect(
      mocks.invoke.mock.calls.map(([, { body }]) => body.finding_ids.length),
    ).toEqual([50, 1]);
    expect(mocks.toast.success).toHaveBeenCalledWith(
      "51 עדכונים נרשמו בכרטיס הלקוח",
    );
  });

  it("dismisses every draft after select all, and names a refusal", async () => {
    mocks.dismiss
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "owner_only" } });
    const user = userEvent.setup();
    render(withTestQuery(<CardDraftsPage />));

    await user.click(await screen.findByLabelText("בחירת הכל"));
    await user.click(
      await screen.findByRole("button", { name: "דחה נבחרים (2)" }),
    );

    expect(mocks.dismiss.mock.calls).toEqual([
      [
        "carmen_finding_set_status",
        { p_finding_id: "f1", p_status: "dismissed" },
      ],
      [
        "carmen_finding_set_status",
        { p_finding_id: "f2", p_status: "dismissed" },
      ],
    ]);
    expect(mocks.toast.success).toHaveBeenCalledWith("עדכון אחד נדחה");
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "עדכון אחד לא נדחה: רק בעלי הארגון יכולים לדחות עדכונים",
    );
  });

  it("offers dismissal to owners only", async () => {
    mocks.owner.current = false;
    render(withTestQuery(<CardDraftsPage />));

    expect(
      await screen.findByRole("button", { name: "אשר נבחרים (0)" }),
    ).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("carmen_manager_is_owner", {
      p_tenant_id: "t1",
    });
    expect(screen.queryByRole("button", { name: /דחה נבחרים/ })).toBeNull();
  });

  it("says nothing waits when there are no drafts", async () => {
    mocks.rows.current = [];
    render(withTestQuery(<CardDraftsPage />));

    expect(
      await screen.findByText("אין עדכונים שמחכים לאישור"),
    ).toBeInTheDocument();
  });
});
