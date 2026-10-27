import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import {
  GRID_CLASSES,
  StoryboardGrid,
  type StoryboardGridProps,
} from "./StoryboardGrid";
import { storyboardScenes } from "./storyboardScenes";

const SCENES = storyboardScenes(
  [
    {
      id: "s1",
      position: 1,
      title: "ההוק",
      overlay_text: "כבר החלפת 8 קמפיינרים?",
      voiceover_text: "",
      motion_prompt: "Carmen leans into the lens",
      duration_s: 3,
      status: "still_ready",
      still_asset_id: "p1",
      clip_asset_id: null,
      clip_stale: false,
      meta: {
        lipsync: true,
        speaker: "כרמן",
        dialogue: "כבר החלפת 8 קמפיינרים?",
      },
    },
    {
      id: "s2",
      position: 2,
      title: "המעצבת",
      overlay_text: "המעצבת",
      voiceover_text: "היא גם מפוקחת על ידי צוות אנושי",
      motion_prompt: "slow orbit",
      duration_s: 4,
      status: "clip_ready",
      still_asset_id: "p2",
      clip_asset_id: "c2",
      clip_stale: true,
      meta: {},
    },
  ],
  new Map([
    ["p1", { id: "p1", url: "https://x/p1.png" }],
    ["p2", { id: "p2", url: "https://x/p2.png" }],
    ["c2", { id: "c2", url: "https://x/c2.mp4" }],
  ]),
);

function renderGrid(over: Partial<StoryboardGridProps> = {}) {
  const props: StoryboardGridProps = {
    scenes: SCENES,
    aspect: "9:16",
    selectedId: null,
    onSelect: vi.fn(),
    onComment: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return { props, ...render(<StoryboardGrid {...props} />) };
}

const card = (number: number) =>
  screen
    .getByRole("button", { name: new RegExp(`^סצנה ${number}:`) })
    .closest("article")!;

test("four cards a row on desktop, two on a tablet, one on a phone, scene 1 at the right", () => {
  renderGrid();
  const list = screen.getByRole("list", { name: "סצנות" });
  for (const name of [
    "grid-cols-1",
    "[@container(min-width:22rem)]:grid-cols-2",
    "[@container(min-width:46rem)]:grid-cols-4",
  ])
    expect(list.className.split(" ")).toContain(name);
  expect(list.className).toBe(GRID_CLASSES);
  expect(screen.getByRole("region", { name: "סטוריבורד" })).toHaveAttribute(
    "dir",
    "rtl",
  );
  const items = within(list).getAllByRole("listitem");
  expect(items[0]).toHaveTextContent("ההוק");
  expect(items[1]).toHaveTextContent("המעצבת");
});

test("a card shows its frame, texts, lip-sync badge, motion and state", () => {
  renderGrid();
  const talking = card(1);
  expect(within(talking).getByText("ליפ סינק")).toBeInTheDocument();
  expect(within(talking).getByText("כרמן אומרת:")).toBeInTheDocument();
  expect(
    within(talking).getByText("Carmen leans into the lens"),
  ).toBeInTheDocument();
  expect(within(talking).getByText("יש תמונה")).toBeInTheDocument();
  expect(talking.querySelector("img")).toHaveAttribute(
    "src",
    "https://x/p1.png",
  );
  const filmed = card(2);
  expect(within(filmed).queryByText("ליפ סינק")).toBe(null);
  expect(
    within(filmed).getByText("היא גם מפוקחת על ידי צוות אנושי"),
  ).toBeInTheDocument();
  expect(within(filmed).getByText("הקליפ לא עדכני")).toBeInTheDocument();
  expect(filmed.querySelector("video")).toHaveAttribute(
    "src",
    "https://x/c2.mp4",
  );
  expect(
    screen.getByRole("button", { name: /^סצנה 1:/ }).getAttribute("style"),
  ).toMatch(/aspect-ratio: 9 \/ 16/);
});

test("a click picks the scene, a second click or Escape lets it go", async () => {
  const user = userEvent.setup();
  const { props, rerender } = renderGrid();
  await user.click(within(card(2)).getByRole("heading"));
  expect(props.onSelect).toHaveBeenLastCalledWith(SCENES[1]);

  rerender(<StoryboardGrid {...props} selectedId="s2" />);
  expect(screen.getByRole("button", { name: /^סצנה 2:/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: /^סצנה 1:/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(card(2)).toHaveAttribute("data-selected", "true");
  expect(screen.getByText(/נבחרה סצנה 2/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^סצנה 2:/ }));
  expect(props.onSelect).toHaveBeenLastCalledWith(null);

  // Escape is taken by the board, so the session column (window listener) stays open.
  const chatSaw: boolean[] = [];
  const closeChat = (event: KeyboardEvent) =>
    chatSaw.push(event.defaultPrevented);
  window.addEventListener("keydown", closeChat);
  vi.mocked(props.onSelect).mockClear();
  fireEvent.keyDown(document.body, { key: "Escape" });
  window.removeEventListener("keydown", closeChat);
  expect(props.onSelect).toHaveBeenCalledWith(null);
  expect(chatSaw).toStrictEqual([true]);
});

test("asking Carmen for a change does not toggle the card", async () => {
  const user = userEvent.setup();
  const { props } = renderGrid();
  await user.click(
    within(card(1)).getByRole("button", { name: /הגיבי \/ בקשי שינוי/ }),
  );
  expect(props.onComment).toHaveBeenCalledWith(SCENES[0]);
  expect(props.onSelect).not.toHaveBeenCalled();
});

test("inline edit saves only what changed, and cancel keeps the scene", async () => {
  const user = userEvent.setup();
  const { props } = renderGrid();
  await user.click(
    screen.getByRole("button", { name: "עריכת הטקסט של סצנה 2" }),
  );
  const form = screen.getByRole("form", { name: "עריכת הטקסט של סצנה 2" });
  const narration = within(form).getByLabelText("קריינות");
  expect(narration).toHaveValue("היא גם מפוקחת על ידי צוות אנושי");
  expect(within(form).queryByLabelText(/ליפ סינק/)).toBe(null);
  await user.clear(narration);
  await user.type(narration, "צוות אנושי עובד לצידה");
  await user.click(within(form).getByRole("button", { name: /שמירה/ }));
  expect(props.onSave).toHaveBeenCalledWith(SCENES[1], {
    voiceover_text: "צוות אנושי עובד לצידה",
  });
  expect(props.onSelect).not.toHaveBeenCalled();
  expect(screen.queryByRole("form")).toBe(null);

  vi.mocked(props.onSave).mockClear();
  await user.click(
    screen.getByRole("button", { name: "עריכת הטקסט של סצנה 1" }),
  );
  const talking = screen.getByRole("form", { name: "עריכת הטקסט של סצנה 1" });
  const line = within(talking).getByLabelText("מה היא אומרת (ליפ סינק)");
  expect(line).toHaveValue("כבר החלפת 8 קמפיינרים?");
  await user.type(line, " משהו");
  await user.click(within(talking).getByRole("button", { name: "ביטול" }));
  expect(props.onSave).not.toHaveBeenCalled();
  expect(screen.queryByRole("form")).toBe(null);
  expect(
    within(card(1)).getByText("״כבר החלפת 8 קמפיינרים?״"),
  ).toBeInTheDocument();
});

test("a failed save opens the form again with what the user typed", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockRejectedValue(new Error("rls"));
  renderGrid({ onSave });
  await user.click(
    screen.getByRole("button", { name: "עריכת הטקסט של סצנה 1" }),
  );
  const text = screen.getByLabelText("טקסט על המסך");
  await user.clear(text);
  await user.type(
    text,
    "הקמפיינר הבא לא יעשה את ההבדל{Control>}{Enter}{/Control}",
  );
  expect(onSave).toHaveBeenCalledWith(SCENES[0], {
    overlay_text: "הקמפיינר הבא לא יעשה את ההבדל",
  });
  await waitFor(() =>
    expect(screen.getByLabelText("טקסט על המסך")).toHaveValue(
      "הקמפיינר הבא לא יעשה את ההבדל",
    ),
  );
});
