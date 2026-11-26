import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  format: null,
  workshop_edit: false,
  ...over,
});

/** Project actions that resolve at once, recorded by vi.fn. */
function actions() {
  return {
    create: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    askCarmen: vi.fn(),
  };
}

/** The list with one unassigned project, "סרט", and the given actions. */
function oneProject(handlers: ReturnType<typeof actions>) {
  return render(
    <WorkshopProjects
      groups={groupProjects([row({ id: "p1", title: "סרט" })], false)}
      byClient={false}
      selectedId={null}
      loading={false}
      error={false}
      actions={handlers}
      onSelect={vi.fn()}
    />,
  );
}

test("a new project is opened with the name and type typed in the dialog", async () => {
  const handlers = actions();
  const user = userEvent.setup();
  oneProject(handlers);

  await user.click(screen.getByRole("button", { name: "חדש" }));
  const open = screen.getByRole("button", { name: "פתיחת פרויקט" });
  expect(open).toBeDisabled();
  await user.type(screen.getByLabelText("שם הפרויקט"), "  השקה  ");
  await user.click(screen.getByRole("button", { name: "עמוד נחיתה" }));
  await user.click(open);

  expect(handlers.create).toHaveBeenCalledWith("השקה", "landing");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});

test("the dialog can hand the project to Carmen instead", async () => {
  const handlers = actions();
  const user = userEvent.setup();
  oneProject(handlers);

  await user.click(screen.getByRole("button", { name: "חדש" }));
  await user.click(screen.getByRole("button", { name: "או לתאר לכרמן בצ׳אט" }));

  expect(handlers.askCarmen).toHaveBeenCalledOnce();
  expect(handlers.create).not.toHaveBeenCalled();
});

test("a project is renamed and deleted from its menu", async () => {
  const handlers = actions();
  const user = userEvent.setup();
  oneProject(handlers);

  await user.click(screen.getByRole("button", { name: "פעולות על סרט" }));
  await user.click(await screen.findByRole("menuitem", { name: "שינוי שם" }));
  const name = screen.getByLabelText("שם הפרויקט");
  await user.clear(name);
  await user.type(name, "סרט חדש");
  await user.click(screen.getByRole("button", { name: "שמירה" }));
  expect(handlers.rename).toHaveBeenCalledWith("p1", "סרט חדש");

  await user.click(screen.getByRole("button", { name: "פעולות על סרט" }));
  await user.click(await screen.findByRole("menuitem", { name: "מחיקה" }));
  expect(
    screen.getByText(/הסצנות, הנכסים והקבצים שלו נשמרים/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "מחיקה" }));
  expect(handlers.archive).toHaveBeenCalledWith("p1");
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
      actions={actions()}
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getAllByText("פיצה")).toHaveLength(1);
  expect(screen.getAllByText("ללא לקוח")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /^סרט/ })).toBeInTheDocument();
});
