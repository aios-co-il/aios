import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OUTSIDE_IMAGE } from "@/components/ReplyMarkdown/replyImageSource.test-fixture";
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

  it("does not load an image a reply names at an outside address, and shows the address as a link", () => {
    const { container } = render(
      <ChatMessageRow
        role="assistant"
        content={`סיימתי ![](${OUTSIDE_IMAGE})`}
      />,
    );

    expect(container.querySelector(".cc-md img")).toBeNull();
    const link = container.querySelector(".cc-md a");
    expect(link).toHaveAttribute("href", OUTSIDE_IMAGE);
    expect(link).toHaveTextContent(OUTSIDE_IMAGE);
  });
});
