import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkshopFeed } from "./WorkshopFeed";

vi.mock("./useWorkshopAssets", () => ({
  useWorkshopAssets: () => ({ data: [], isLoading: false }),
}));

const BRIEF =
  "סרטון לכרמן\n\nפרטים שנוספו לבריף:\nקצב: מהיר\nפונט: Heebo, טקסט גדול";

describe("WorkshopFeed brief page", () => {
  // jsdom has no scrollIntoView: the feed scrolls to its end, so the test lends one and takes it back.
  const scrollIntoView = Element.prototype.scrollIntoView;
  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  test("shows the whole brief, one answer per line", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <WorkshopFeed
        artifacts={[
          {
            id: "brief-page",
            item_id: "item-1",
            kind: "brief",
            folder: "",
            title: "סרטון לכרמן",
            status: "ready",
            url: null,
            thumb_url: null,
            meta: { summary: "סרט 9:16", brief: BRIEF },
            created_at: "2026-11-04T10:00:00Z",
          },
        ]}
        loading={false}
        hasProject
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const brief = screen.getByText(/פונט: Heebo, טקסט גדול/);
    expect(brief.textContent).toBe(BRIEF);
    expect(brief.className).toContain("whitespace-pre-wrap");
  });
});
