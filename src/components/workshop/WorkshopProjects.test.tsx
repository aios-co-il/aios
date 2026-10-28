import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { WorkshopProjects } from "./WorkshopProjects";
import { groupProjects, type WorkshopListRow } from "./workshopProjectList";

const row = (over: Partial<WorkshopListRow>): WorkshopListRow => ({
  id: "x",
  title: null,
  status: "draft",
  client_id: null,
  client_name: null,
  department_hint: null,
  has_board: true,
  project_type: null,
  target_channel: null,
  track: null,
  stage_type: null,
  has_copy: false,
  has_creative: false,
  has_seo_plan: false,
  updated_at: "2026-10-26T10:00:00Z",
  ...over,
});

test("with every client in view, each client is named once, in its group header", () => {
  const groups = groupProjects(
    [
      row({ id: "a", title: "מודעה", client_id: "c-1", client_name: "פיצה" }),
      row({ id: "b", title: "סרט", client_id: "c-1", client_name: "פיצה" }),
      row({ id: "c", title: "פוסט" }),
    ],
    true,
  );
  render(
    <WorkshopProjects
      groups={groups}
      byClient
      selectedId={null}
      loading={false}
      error={false}
      onCreate={vi.fn()}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getAllByText("פיצה")).toHaveLength(1);
  expect(screen.getAllByText("ללא לקוח")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /סרט/ })).toBeInTheDocument();
});
