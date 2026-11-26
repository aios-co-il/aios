import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JWT_PUBLISHABLE_KEY,
  OUTSIDE_IMAGE,
  PROJECT_ORIGIN,
} from "@/components/ReplyMarkdown/replyImageSource.test-fixture";
import { CreativeStudioChat } from "./CreativeStudioChat";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: "token" } } }),
    },
  },
}));

let project = 0;

/** Sends one message in a new project's chat and returns Carmen's rendered answer to it. */
async function carmenAnswers(reply: string): Promise<HTMLElement> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "token", content: reply })}\n\n`,
        ),
      ),
    ),
  );
  project += 1;
  const user = userEvent.setup();
  render(
    <CreativeStudioChat
      tenantId="tenant-1"
      clientId={null}
      itemId={`item-${project}`}
      mode="static"
      contextAddon={() => ""}
      onUiAction={vi.fn()}
      onTurnDone={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  await user.type(screen.getByRole("textbox"), "תראי לי{Enter}");

  return screen.findByTestId("studio-answer");
}

describe("CreativeStudioChat", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://api.aios.co.il");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", JWT_PUBLISHABLE_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not load a picture Carmen's answer names at an outside address, and shows the address as a link", async () => {
    const answer = await carmenAnswers(`סיימתי ![דוח](${OUTSIDE_IMAGE})`);

    expect(answer.querySelector("img")).toBeNull();
    const link = answer.querySelector("a");
    expect(link).toHaveAttribute("href", OUTSIDE_IMAGE);
    expect(link).toHaveTextContent(OUTSIDE_IMAGE);
  });

  it("shows a built-in skin portrait, served by the app itself", async () => {
    const portrait = `${window.location.origin}/brand/carmen/skins/analyst.webp`;

    const answer = await carmenAnswers(
      `הנה הסקינים:\n![האנליסטית](${portrait})`,
    );

    const image = answer.querySelector("img");
    expect(image).toHaveAttribute("src", portrait);
    expect(image).toHaveAttribute("alt", "האנליסטית");
  });

  it("shows a custom skin portrait, a signed link on the project's own address", async () => {
    const portrait = `${PROJECT_ORIGIN}/storage/v1/object/sign/carmen-skins/tenant-1/designer.png?token=abc`;

    const answer = await carmenAnswers(`![המעצבת](${portrait})`);

    expect(answer.querySelector("img")).toHaveAttribute("src", portrait);
  });
});
