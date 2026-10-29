import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkshopAssignControl } from "./WorkshopAssignControl";
import type { WorkshopListRow } from "./workshopProjectList";

vi.mock("@/integrations/supabase/client", () => {
  const result = {
    data: [{ id: "client-1", name: "לקוח א", agency_id: null }],
  };
  const chain: Record<string, unknown> = {
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
  return { supabase: { from: () => chain } };
});

const row = (over: Partial<WorkshopListRow>): WorkshopListRow => ({
  id: "item-1",
  title: "פרויקט",
  status: "draft",
  client_id: "client-1",
  client_name: "לקוח א",
  department_hint: null,
  has_board: false,
  project_type: null,
  target_channel: null,
  track: null,
  stage_type: null,
  has_copy: false,
  has_creative: false,
  has_seo_plan: false,
  updated_at: "2026-10-26T10:00:00Z",
  format: null,
  workshop_edit: false,
  ...over,
});

const renderControl = (item: WorkshopListRow) =>
  render(
    <TooltipProvider delayDuration={0}>
      <WorkshopAssignControl
        tenantId="tenant-1"
        item={item}
        onAssign={vi.fn()}
      />
    </TooltipProvider>,
  );

test("an assigned SEO project's picker is disabled and says why", async () => {
  renderControl(row({ department_hint: "seo" }));
  const picker = screen.getByRole("button", { name: /לקוח א/ });
  expect(picker).toBeDisabled();
  fireEvent.focus(picker.parentElement as HTMLElement);
  const tips = await screen.findAllByText(/פרויקט SEO \/ GEO נשאר אצל הלקוח/);
  expect(tips.length).toBeGreaterThan(0);
});

test("an assigned social project is locked too", () => {
  renderControl(row({ track: "social_organic" }));
  expect(screen.getByRole("button", { name: /לקוח א/ })).toBeDisabled();
});

test("copy, creative and unassigned SEO projects can be assigned", () => {
  for (const item of [
    row({ department_hint: "copy" }),
    row({ has_board: true }),
    row({ department_hint: "seo", client_id: null, client_name: null }),
  ]) {
    const { unmount } = renderControl(item);
    expect(screen.getByRole("button")).toBeEnabled();
    unmount();
  }
});

test("picking the client the project already has assigns nothing", async () => {
  const onAssign = vi.fn();
  const pick = async (item: WorkshopListRow) => {
    const { unmount } = render(
      <TooltipProvider>
        <WorkshopAssignControl
          tenantId="tenant-1"
          item={item}
          onAssign={onAssign}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("בחר סוכנות");
    // The last one is the popover's option; an unassigned picker is labelled the same.
    fireEvent.click(
      screen.getAllByRole("button", { name: /ללא לקוח/ }).at(-1) as HTMLElement,
    );
    unmount();
  };
  await pick(row({ client_id: null, client_name: null }));
  expect(onAssign).not.toHaveBeenCalled();
  await pick(row({ department_hint: "copy" }));
  expect(onAssign).toHaveBeenCalledWith(null);
});

test("busy disables the picker while an assignment runs", () => {
  render(
    <TooltipProvider>
      <WorkshopAssignControl
        tenantId="tenant-1"
        item={row({ department_hint: "copy" })}
        busy
        onAssign={vi.fn()}
      />
    </TooltipProvider>,
  );
  expect(screen.getByRole("button")).toBeDisabled();
});
