import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChoiceScope,
  type ChoicesState,
  carmenChoicesKey,
} from "./carmenChoiceQueries";
import {
  reportSaveError,
  rereadChoices,
  showBrainOnceStored,
  showVoiceAtOnce,
  storeChoice,
} from "./carmenChoiceWrites";

const state = vi.hoisted(() => ({
  saveCarmenChoice: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("./carmenChoiceQueries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./carmenChoiceQueries")>()),
  saveCarmenChoice: state.saveCarmenChoice,
}));
vi.mock("sonner", () => ({ toast: { error: state.toastError } }));

const scope: ChoiceScope = {
  tenantId: "tenant-a",
  userId: "user-1",
  viewAsUserId: null,
};
const queryKey = carmenChoicesKey(scope);
const stored: ChoicesState = {
  brainSlug: "cursor",
  voice: "cedar",
  answered: true,
};

/** A query cache holding the user's stored picks, with `writes` pick writes in flight. */
function cacheWith(writes: number) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKey, stored);
  vi.spyOn(queryClient, "isMutating").mockReturnValue(writes);
  return queryClient;
}

/** The picks the app shows. */
function shown(queryClient: QueryClient) {
  return queryClient.getQueryData<ChoicesState>(queryKey);
}

beforeEach(() => {
  localStorage.clear();
  state.saveCarmenChoice.mockReset();
  state.toastError.mockClear();
});

describe("carmenChoiceWrites", () => {
  it("shows a picked voice at once and leaves a picked brain for the row to confirm", async () => {
    const queryClient = cacheWith(1);

    await showVoiceAtOnce(queryClient, { scope, patch: { voice: "marin" } });
    await showVoiceAtOnce(queryClient, {
      scope,
      patch: { brain_slug: "grok" },
    });

    expect(shown(queryClient)).toEqual({ ...stored, voice: "marin" });
  });

  it("makes a stored brain the pick, also while a newer write is in flight, and leaves a voice alone", async () => {
    const lastWrite = cacheWith(1);
    const earlierWrite = cacheWith(2);
    const write = { scope, patch: { brain_slug: "grok" } };

    await showBrainOnceStored(lastWrite, write);
    await showBrainOnceStored(earlierWrite, write);
    await showBrainOnceStored(lastWrite, { scope, patch: { voice: "marin" } });

    expect(shown(lastWrite)).toEqual({ ...stored, brainSlug: "grok" });
    expect(shown(earlierWrite)).toEqual({ ...stored, brainSlug: "grok" });
  });

  it("does not let a read that started before the pick undo it", async () => {
    const queryClient = cacheWith(1);
    const read: { finish?: (row: ChoicesState) => void } = {};
    const earlierRead = queryClient.fetchQuery({
      queryKey,
      queryFn: () =>
        new Promise<ChoicesState>((resolve) => {
          read.finish = resolve;
        }),
    });

    await showVoiceAtOnce(queryClient, { scope, patch: { voice: "marin" } });
    read.finish?.(stored);
    await earlierRead;

    expect(shown(queryClient)?.voice).toBe("marin");
  });

  it("shows a pick made before any answer on top of the cached picks, unanswered", async () => {
    const queryClient = new QueryClient();
    localStorage.setItem(
      "aios:carmen-choices:tenant-a:user-1",
      '{"brainSlug":"gpt-fast","voice":null}',
    );

    await showVoiceAtOnce(queryClient, { scope, patch: { voice: "marin" } });

    expect(shown(queryClient)).toEqual({
      brainSlug: "gpt-fast",
      voice: "marin",
      answered: false,
    });
  });

  it("reads the row again after the last write only", () => {
    const lastWrite = cacheWith(1);
    const earlierWrite = cacheWith(2);
    const rereadLast = vi.spyOn(lastWrite, "invalidateQueries");
    const rereadEarlier = vi.spyOn(earlierWrite, "invalidateQueries");

    rereadChoices(lastWrite, scope, 1);
    rereadChoices(earlierWrite, scope, 1);

    expect(rereadLast).toHaveBeenCalledExactlyOnceWith({
      queryKey,
      exact: true,
    });
    expect(rereadEarlier).not.toHaveBeenCalled();
  });

  it("reads the row again for a change from elsewhere, unless a write of our own is in flight", () => {
    const idle = cacheWith(0);
    const writing = cacheWith(1);
    const rereadIdle = vi.spyOn(idle, "invalidateQueries");
    const rereadWriting = vi.spyOn(writing, "invalidateQueries");

    rereadChoices(idle, scope);
    rereadChoices(writing, scope);

    expect(rereadIdle).toHaveBeenCalledExactlyOnceWith({
      queryKey,
      exact: true,
    });
    expect(rereadWriting).not.toHaveBeenCalled();
  });

  it("sends a pick to the row, but keeps a view-as pick in the session", async () => {
    const patch = { brain_slug: "grok" };

    await storeChoice({ scope, patch });
    await storeChoice({ scope: { ...scope, viewAsUserId: "user-2" }, patch });

    expect(state.saveCarmenChoice).toHaveBeenCalledExactlyOnceWith(
      "tenant-a",
      patch,
    );
  });

  it("logs a failed write and names the pick that was not stored", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    reportSaveError(new Error("denied"), { scope, patch: { voice: "marin" } });
    reportSaveError(new Error("denied"), { scope, patch: { brain_slug: "x" } });

    expect(logged.mock.calls.map(([tag]) => tag)).toEqual([
      "[carmenChoiceWrites] the pick was not stored",
      "[carmenChoiceWrites] the pick was not stored",
    ]);
    expect(state.toastError.mock.calls).toEqual([
      ["הקול שנבחר לא נשמר"],
      ["המוח שנבחר לא נשמר, והוא יחול רק כאן"],
    ]);
  });
});
