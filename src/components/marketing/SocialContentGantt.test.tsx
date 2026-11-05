import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { SocialContentGantt } from "./SocialContentGantt";

const db = vi.hoisted(() => ({
  updates: vi.fn(),
  error: null as Error | null,
}));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: notifications }));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
      <option value="unsupported-status">Unsupported status</option>
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let updating = false;
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        update: (patch: object) => {
          updating = true;
          db.updates(patch);
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: updating
              ? null
              : [
                  {
                    id: "post-1",
                    title: "Social draft",
                    status: "draft",
                    scheduled_date: null,
                    payload: {},
                    current_stage_id: null,
                  },
                ],
            error: updating ? db.error : null,
          }).then(resolve),
      };
      return query;
    },
  },
}));

describe("SocialContentGantt status persistence", () => {
  beforeEach(() => {
    db.error = null;
  });

  test("saves the approval choice using the database waiting_approval status", async () => {
    render(
      withTestQuery(
        <SocialContentGantt
          pipelineId="pipeline-1"
          tenantId="tenant-1"
          clientId="client-1"
        />,
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Social draft" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    const approval = dialog.getByRole<HTMLOptionElement>("option", {
      name: "לאישור",
    });
    fireEvent.change(dialog.getByRole("combobox"), {
      target: { value: approval.value },
    });
    fireEvent.click(dialog.getByRole("button", { name: "שמור שינויים" }));
    await waitFor(() =>
      expect(db.updates).toHaveBeenCalledWith({ status: "waiting_approval" }),
    );
    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith("עודכן"),
    );
  });

  test("ignores an unsupported status without changing the selection or updating", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        withTestQuery(
          <SocialContentGantt
            pipelineId="pipeline-1"
            tenantId="tenant-1"
            clientId="client-1"
          />,
        ),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Social draft" }),
      );
      const dialog = within(screen.getByRole("dialog"));
      const status = dialog.getByRole("combobox");
      expect(status).toHaveValue("draft");
      diagnostic.mockClear();
      fireEvent.change(status, { target: { value: "unsupported-status" } });
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith(
        "Invalid marketing item status",
      );
      expect(status).toHaveValue("draft");
      fireEvent.click(dialog.getByRole("button", { name: "שמור שינויים" }));
      expect(db.updates).not.toHaveBeenCalled();
      expect(notifications.success).not.toHaveBeenCalled();
    } finally {
      diagnostic.mockRestore();
    }
  });

  test("reports a rejected status update", async () => {
    db.error = new Error("Update rejected");
    render(
      withTestQuery(
        <SocialContentGantt
          pipelineId="pipeline-1"
          tenantId="tenant-1"
          clientId="client-1"
        />,
      ),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Social draft" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByRole("combobox"), {
      target: { value: "approved" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "שמור שינויים" }));
    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith("שגיאה בעדכון"),
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });
});
