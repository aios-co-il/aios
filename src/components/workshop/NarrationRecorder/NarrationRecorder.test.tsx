import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prefillComposer } from "@/lib/workshopBridge";
import { withTestQuery } from "@/test/withTestQuery";
import type { StoryboardScene } from "../storyboardScenes";
import { fakeMedia } from "./fakeMedia";
import { NarrationRecorder } from "./NarrationRecorder";

const upload = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload }) } },
}));
vi.mock("@/lib/workshopBridge", () => ({ prefillComposer: vi.fn() }));

let media: ReturnType<typeof fakeMedia>;

beforeEach(() => {
  media = fakeMedia();
  URL.createObjectURL = vi.fn(() => "blob:take");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

const scenes = [
  { voiceover: "כרמן מנהלת את הכול.", lipsync: false },
] as Array<StoryboardScene>;

describe("NarrationRecorder", () => {
  test("the dialog stays open while the recording uploads, and its line reaches the chat", async () => {
    let stored: (value: { error: null }) => void = () => {};
    upload.mockReturnValue(
      new Promise((resolve) => {
        stored = resolve;
      }),
    );
    const openChat = vi.fn();
    const user = userEvent.setup();
    render(
      withTestQuery(
        <NarrationRecorder
          tenantId="tenant-1"
          clientId={null}
          itemId="item-1"
          scenes={scenes}
          openChat={openChat}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: /הקלטה בקול שלי/ }));
    expect(screen.getByText("כרמן מנהלת את הכול.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /התחלת הקלטה/ }));
    await act(async () => media.grant());
    await user.click(await screen.findByRole("button", { name: /עצירה/ }));
    await user.click(screen.getByRole("button", { name: /שליחה לכרמן/ }));

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();

    await act(async () => stored({ error: null }));
    await waitFor(() => expect(prefillComposer).toHaveBeenCalledTimes(1));
    const line = vi.mocked(prefillComposer).mock.calls[0][0];
    expect(line).toMatch(
      /^הקלטתי את הקריינות בקול שלי: tenant-1\/general\/item-1\/narration\/guide-\d+\.mp4\n$/,
    );
    expect(openChat).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("a failed send's error is gone when the recorder is opened again", async () => {
    upload.mockResolvedValue({ error: new Error("network") });
    const user = userEvent.setup();
    render(
      withTestQuery(
        <NarrationRecorder
          tenantId="tenant-1"
          clientId={null}
          itemId="item-1"
          scenes={scenes}
          openChat={vi.fn()}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: /הקלטה בקול שלי/ }));
    await user.click(screen.getByRole("button", { name: /התחלת הקלטה/ }));
    await act(async () => media.grant());
    await user.click(await screen.findByRole("button", { name: /עצירה/ }));
    await user.click(screen.getByRole("button", { name: /שליחה לכרמן/ }));
    expect(await screen.findByText(/ההקלטה לא נשלחה/)).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: /הקלטה בקול שלי/ }));

    expect(screen.queryByText(/ההקלטה לא נשלחה/)).toBeNull();
  });
});
