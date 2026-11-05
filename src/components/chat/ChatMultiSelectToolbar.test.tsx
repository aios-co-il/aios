import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ChatMultiSelectToolbar } from "./ChatMultiSelectToolbar";
import type { FakeChatTagsTables } from "./fakeChatTagsDb";
import { TAG_REMOVE_REFUSED } from "./removeContactTag";

const backend = vi.hoisted(() => ({ tables: {} as FakeChatTagsTables }));

vi.mock("@/integrations/supabase/client", async () => {
  const { fakeChatTagsDb } = await import("./fakeChatTagsDb");
  return { supabase: fakeChatTagsDb(backend.tables) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const LIST_KEY = ["contact-tags-for-list", "t1"];

/** Lead chat `n`, named "ליד n" unless a name is given. */
function leadChat(n: number, name = `ליד ${n}`) {
  return { id: `l${n}`, name, contact_type: "lead" as const };
}

/** A link of the "חם" tag to lead chat `n`. */
function hotTagOn(n: number) {
  return { id: `ct${n}`, tenant_id: "t1", tag_id: "hot", lead_id: `l${n}` };
}

/** Renders the toolbar over `chats`, removes the "חם" tag, and returns the query cache. */
async function removeHotTag(chats: Array<ReturnType<typeof leadChat>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(LIST_KEY, []);
  render(
    <QueryClientProvider client={queryClient}>
      <ChatMultiSelectToolbar
        selectedContacts={chats}
        onClearSelection={vi.fn()}
        tenantId="t1"
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "הסר תג" }));
  await userEvent.click(await screen.findByText("חם"));
  return queryClient;
}

beforeEach(() => {
  backend.tables.chat_tags = [
    { id: "hot", tenant_id: "t1", name: "חם", color: "#f00" },
  ];
  backend.tables.keptIds = [];
});

describe("ChatMultiSelectToolbar remove tag", () => {
  test("chats without the tag are skipped: the rest are removed with no error", async () => {
    const otherTag = {
      id: "x",
      tenant_id: "t1",
      tag_id: "cold",
      lead_id: "l1",
    };
    backend.tables.chat_contact_tags = [hotTagOn(2), hotTagOn(4), otherTag];

    const queryClient = await removeHotTag(
      [1, 2, 3, 4, 5].map((n) => leadChat(n)),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("התג הוסר מ-2 צ'אטים"),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(backend.tables.chat_contact_tags).toEqual([otherTag]);
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true);
  });

  test("a row RLS keeps is reported for that chat only, and the list still refreshes", async () => {
    backend.tables.chat_contact_tags = [hotTagOn(1), hotTagOn(2)];
    backend.tables.keptIds = ["ct2"];

    const queryClient = await removeHotTag([
      leadChat(1),
      leadChat(2, "דנה"),
      leadChat(3, "יוסי"),
    ]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        `התג לא הוסר מ-1 צ'אטים (דנה): ${TAG_REMOVE_REFUSED}`,
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(backend.tables.chat_contact_tags).toEqual([hotTagOn(2)]);
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true);
  });
});
