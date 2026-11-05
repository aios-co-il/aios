import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { subscribeComposerPrefill } from "@/lib/workshopBridge";
import { withTestQuery } from "@/test/withTestQuery";
import { WorkshopFeed } from "./WorkshopFeed";
import type { WorkshopArtifact } from "./workshopFeedModel";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("./useWorkshopAssets", () => ({
  useWorkshopAssets: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

const BRIEF =
  "סרטון לכרמן\n\nפרטים שנוספו לבריף:\nקצב: מהיר\nפונט: Heebo, טקסט גדול";

const page = (over: Partial<WorkshopArtifact>): WorkshopArtifact => ({
  id: "page-1",
  item_id: "item-1",
  kind: "brief",
  folder: "",
  title: "סרטון לכרמן",
  status: "ready",
  url: null,
  thumb_url: null,
  meta: {},
  created_at: "2026-11-04T10:00:00Z",
  ...over,
});

const feed = (artifacts: Array<WorkshopArtifact>, openChat = vi.fn()) =>
  withTestQuery(
    <WorkshopFeed
      artifacts={artifacts}
      loading={false}
      hasProject
      selectedId={null}
      onSelect={() => {}}
      tenantId="tenant-1"
      projectId="item-1"
      openChat={openChat}
    />,
  );

describe("WorkshopFeed", () => {
  // jsdom has no scrollIntoView: the feed scrolls to its end, so the test lends one and takes it back.
  const scrollIntoView = Element.prototype.scrollIntoView;
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  test("shows the whole brief, one answer per line", () => {
    render(feed([page({ meta: { summary: "סרט 9:16", brief: BRIEF } })]));
    const brief = screen.getByText(/פונט: Heebo, טקסט גדול/);
    expect(brief.textContent).toBe(BRIEF);
    expect(brief.className).toContain("whitespace-pre-wrap");
  });

  test("approving a concept opens Carmen with the concept line in her composer", async () => {
    const user = userEvent.setup();
    const heard: Array<string> = [];
    const stop = subscribeComposerPrefill((text) => heard.push(text));
    const openChat = vi.fn();
    render(
      feed(
        [page({ kind: "concept", title: "יום אחד", meta: { text: "מסע" } })],
        openChat,
      ),
    );
    await user.click(screen.getByRole("button", { name: /אישור הקונספט/ }));
    stop();
    expect(openChat).toHaveBeenCalled();
    expect(heard).toStrictEqual(["קונספט: יום אחד\n"]);
  });

  test("a script edited on the board is saved with its beats, and the script has no approve button", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    const beats = [
      { start_s: 0, end_s: 2, narration: "שלום", on_screen: "", visual: "" },
    ];
    render(
      feed([
        page({
          kind: "script",
          title: "תסריט · חג",
          meta: { text: "תסריט · חג", beats },
        }),
      ]),
    );
    expect(screen.queryByRole("button", { name: /אישור/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /עריכה/ }));
    const form = screen.getByRole("form", { name: "עריכת העמוד" });
    const narration = within(form).getByLabelText("קריינות");
    await user.clear(narration);
    await user.type(narration, "שלום לכולם");
    await user.click(within(form).getByRole("button", { name: /שמירה/ }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("workshop_edit_page");
    expect(args.p_beats).toEqual([
      { narration: "שלום לכולם", on_screen: "", visual: "" },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "עריכת העמוד" })).toBeNull(),
    );
  });

  test("narration too long for its beat is flagged and not saved", async () => {
    mocks.rpc.mockClear();
    const user = userEvent.setup();
    const beats = [
      { start_s: 0, end_s: 2, narration: "שלום", on_screen: "", visual: "" },
    ];
    render(
      feed([
        page({
          kind: "script",
          title: "תסריט · חג",
          meta: { text: "תסריט · חג", beats },
        }),
      ]),
    );
    await user.click(screen.getByRole("button", { name: /עריכה/ }));
    const form = screen.getByRole("form", { name: "עריכת העמוד" });
    const narration = within(form).getByLabelText("קריינות");
    await user.clear(narration);
    await user.type(narration, "שלום לכולם וברוכים הבאים לחג השנה");
    expect(within(form).getByRole("alert").textContent).toMatch(
      /6 מילים לא נכנסות ב-2 שניות \(עד 5\)/,
    );
    expect(within(form).getByRole("button", { name: /שמירה/ })).toBeDisabled();
    await user.type(narration, "{Control>}{Enter}{/Control}");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
