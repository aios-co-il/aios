import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatMessageRow } from "./ChatMessageRow";

vi.mock("@/hooks/useCarmenIdentity", () => ({
  useCarmenIdentity: () => ({
    name: "כרמן",
    image: "carmen.png",
    custom: false,
    activeSkin: null,
  }),
}));
vi.mock("@/hooks/useCarmenAvatarStyle", () => ({
  useCarmenAvatarStyle: () => ({ style: "orbs" }),
}));

describe("ChatMessageRow", () => {
  it("inverts Carmen's reply text only in dark mode, so it reads on the light theme", () => {
    const { container } = render(
      <ChatMessageRow
        role="assistant"
        content="| לקוח | סטטוס |\n|---|---|\n| א | קריטי |"
      />,
    );
    const body = container.querySelector(".cc-md");
    expect(body).toHaveClass("prose", "dark:prose-invert");
    expect(body).not.toHaveClass("prose-invert");
    expect(body).toHaveTextContent("קריטי");
  });
});
