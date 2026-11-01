import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ToolsTab } from "./ToolsTab";

vi.mock("@/hooks/useCurrentTenant", () => ({
  useCurrentTenant: () => ({ tenantId: "tenant-a" }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

/** The checkbox of the tool whose label matches `label`. */
const checkboxOf = (label: RegExp) =>
  screen.getByRole("checkbox", { name: label });

describe("ToolsTab", () => {
  test("Carmen's pulse tools show as always on past a narrow allowed_tools", () => {
    render(
      <ToolsTab
        agent={{ id: "a-1", name: "כרמן", allowed_tools: ["list_leads"] }}
      />,
    );
    for (const label of [/בדיקת דופק שמורה/, /רענון בדיקת דופק/]) {
      const box = checkboxOf(label);
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    expect(screen.getAllByText("תמיד פעיל לכרמן")).toHaveLength(2);
    expect(checkboxOf(/ניתוח קמפיינים/)).not.toBeChecked();
  });

  test("a pulse tool turned off in disabled_tools is not shown as always on", () => {
    render(
      <ToolsTab
        agent={{
          id: "a-3",
          name: "כרמן",
          allowed_tools: ["list_leads"],
          disabled_tools: ["refresh_campaign_pulse"],
        }}
      />,
    );
    const refresh = checkboxOf(/רענון בדיקת דופק/);
    expect(refresh).not.toBeChecked();
    expect(refresh).toBeEnabled();
    expect(checkboxOf(/בדיקת דופק שמורה/)).toBeDisabled();
    expect(screen.getAllByText("תמיד פעיל לכרמן")).toHaveLength(1);
  });

  test("other agents can turn the pulse tools off", () => {
    render(
      <ToolsTab
        agent={{ id: "a-2", name: "Sales bot", allowed_tools: ["list_leads"] }}
      />,
    );
    const box = checkboxOf(/רענון בדיקת דופק/);
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
    expect(screen.queryByText("תמיד פעיל לכרמן")).toBeNull();
  });
});
