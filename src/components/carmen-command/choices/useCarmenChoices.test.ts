import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryHarness } from "@/test/withTestQuery";
import { choiceCacheKey, readChoiceCache } from "./carmenChoiceCache";
import {
  DENIED,
  backend,
  gate,
  resetBackend,
  toastError,
} from "./carmenChoiceQueries.test-fixture";
import { useCarmenChoices } from "./useCarmenChoices";

vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("./carmenChoiceQueries.test-fixture")).fakeSupabase,
}));
vi.mock("@/hooks/useCurrentUser", async () => ({
  useCurrentUser: (await import("./carmenChoiceQueries.test-fixture"))
    .fakeCurrentUser,
}));
vi.mock("@/contexts/ViewAsContext", async () => ({
  useViewAs: (await import("./carmenChoiceQueries.test-fixture")).fakeViewAs,
}));
vi.mock("sonner", async () => ({
  toast: {
    error: (await import("./carmenChoiceQueries.test-fixture")).toastError,
  },
}));

const UNREACHABLE = { message: "unreachable" };

/**
 * Mounts the hook for one org and waits until its picks are settled.
 * `seenBrains` lists every stored brain a render reported.
 */
async function mountSettled(tenantId: string | null = "tenant-a") {
  const { wrapper } = createTestQueryHarness();
  const seenBrains: Array<string | null> = [];
  const view = renderHook(
    () => {
      const choices = useCarmenChoices(tenantId);
      seenBrains.push(choices.brainSlug);
      return choices;
    },
    { wrapper },
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return { ...view, seenBrains };
}

beforeEach(() => {
  localStorage.clear();
  resetBackend();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useCarmenChoices", () => {
  it("reads the stored picks and caches them for this org and user", async () => {
    backend.row = { brain_slug: "gpt-fast", voice: "cedar" };

    const { result } = await mountSettled();

    expect(result.current).toMatchObject({
      brainSlug: "gpt-fast",
      voice: "cedar",
      answered: true,
    });
    expect(readChoiceCache("tenant-a", "user-1")).toEqual({
      brainSlug: "gpt-fast",
      voice: "cedar",
    });
  });

  it("reads a user without a row as no picks", async () => {
    const { result } = await mountSettled();

    expect(result.current).toMatchObject({
      brainSlug: null,
      voice: null,
      answered: true,
    });
  });

  it("uses the cache when the read fails, without calling it the server's answer", async () => {
    localStorage.setItem(
      choiceCacheKey("tenant-a", "user-1"),
      '{"brainSlug":"gpt-fast","voice":null}',
    );
    backend.readError = UNREACHABLE;

    const { result } = await mountSettled();

    expect(result.current).toMatchObject({
      brainSlug: "gpt-fast",
      answered: false,
    });
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[carmenChoiceQueries] the picks were not read",
      UNREACHABLE,
    );
  });

  it("stores a brain pick alone, so the voice on the row is untouched", async () => {
    backend.row = { brain_slug: null, voice: "cedar" };
    const { result } = await mountSettled();

    act(() => result.current.saveBrain("gpt-fast"));

    await waitFor(() => expect(result.current.brainSlug).toBe("gpt-fast"));
    expect(result.current.voice).toBe("cedar");
    expect(backend.upserts).toEqual([
      {
        row: { tenant_id: "tenant-a", brain_slug: "gpt-fast" },
        options: { onConflict: "tenant_id,user_id" },
      },
    ]);
    await waitFor(() =>
      expect(readChoiceCache("tenant-a", "user-1")?.brainSlug).toBe("gpt-fast"),
    );
  });

  it("stores a voice pick alone, and null to return to Carmen's voice", async () => {
    backend.row = { brain_slug: "gpt-fast", voice: "cedar" };
    const { result } = await mountSettled();

    act(() => result.current.saveVoice(null));

    await waitFor(() => expect(result.current.voice).toBeNull());
    expect(result.current.brainSlug).toBe("gpt-fast");
    expect(backend.upserts[0].row).toEqual({
      tenant_id: "tenant-a",
      voice: null,
    });
  });

  it("shows a picked voice before the row confirms it, then restores the server's value when the write is refused", async () => {
    backend.row = { brain_slug: null, voice: "cedar" };
    const { result } = await mountSettled();
    const write = gate();
    backend.writeGate = write.closed;
    backend.writeErrors = [DENIED];

    act(() => result.current.saveVoice("marin"));
    await waitFor(() => expect(result.current.voice).toBe("marin"));
    write.open();

    await waitFor(() => expect(result.current.voice).toBe("cedar"));
    expect(toastError).toHaveBeenCalledWith("הקול שנבחר לא נשמר");
  });

  it("keeps a picked voice for the session when the row cannot be reached at all", async () => {
    backend.readError = UNREACHABLE;
    backend.writeErrors = [UNREACHABLE];
    const { result } = await mountSettled();
    const readsBefore = backend.reads;

    act(() => result.current.saveVoice("marin"));

    await waitFor(() => expect(backend.reads).toBeGreaterThan(readsBefore));
    expect(toastError).toHaveBeenCalledWith("הקול שנבחר לא נשמר");
    expect(result.current.voice).toBe("marin");
  });

  it("never reports a brain the row refused as the stored pick", async () => {
    backend.row = { brain_slug: "cursor", voice: null };
    const { result, seenBrains } = await mountSettled();
    const readsBefore = backend.reads;
    backend.writeErrors = [DENIED];

    act(() => result.current.saveBrain("gpt-fast"));

    await waitFor(() => expect(backend.reads).toBeGreaterThan(readsBefore));
    expect(toastError).toHaveBeenCalledWith(
      "המוח שנבחר לא נשמר, והוא יחול רק כאן",
    );
    expect(seenBrains).not.toContain("gpt-fast");
  });

  it("reports each of two brain picks made in a row once the row holds it", async () => {
    backend.row = { brain_slug: "cursor", voice: null };
    const { result } = await mountSettled();
    const first = gate();
    const second = gate();
    backend.writeGate = first.closed;

    act(() => {
      result.current.saveBrain("grok");
      result.current.saveBrain("gpt-fast");
    });

    await waitFor(() => expect(backend.upserts).toHaveLength(1));

    expect(result.current.brainSlug).toBe("cursor");

    backend.writeGate = second.closed;
    first.open();

    await waitFor(() => expect(result.current.brainSlug).toBe("grok"));
    expect(backend.reads).toBe(1);

    second.open();

    await waitFor(() => expect(result.current.brainSlug).toBe("gpt-fast"));
    await waitFor(() => expect(backend.reads).toBe(2));
  });

  it("is settled only while no write or read of the picks is under way", async () => {
    const { result } = await mountSettled();
    await waitFor(() => expect(result.current.settled).toBe(true));
    const write = gate();
    const read = gate();
    backend.writeGate = write.closed;
    backend.readGate = read.closed;

    act(() => result.current.saveBrain("grok"));

    await waitFor(() => expect(result.current.settled).toBe(false));

    write.open();
    await waitFor(() => expect(result.current.brainSlug).toBe("grok"));
    await waitFor(() => expect(backend.reads).toBe(2));

    expect(result.current.settled).toBe(false);

    read.open();

    await waitFor(() => expect(result.current.settled).toBe(true));
  });

  it("refuses a pick made before an org is selected, and tells the user", async () => {
    const { wrapper } = createTestQueryHarness();
    const { result } = renderHook(() => useCarmenChoices(null), { wrapper });

    expect(result.current).toMatchObject({ ready: false, settled: false });

    act(() => result.current.saveBrain("grok"));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(backend.upserts).toEqual([]);
  });

  it("neither reads nor writes the admin's own row in view-as, and keeps a pick for the session", async () => {
    backend.row = { brain_slug: "gpt-fast", voice: "cedar" };
    const adminCache = '{"brainSlug":"gpt-fast","voice":"cedar"}';
    localStorage.setItem(choiceCacheKey("tenant-a", "user-1"), adminCache);
    backend.viewAsUserId = "user-2";
    const { result } = await mountSettled();

    expect(result.current).toMatchObject({ brainSlug: null, voice: null });

    act(() => result.current.saveBrain("cursor"));

    await waitFor(() => expect(result.current.brainSlug).toBe("cursor"));
    expect(backend.reads).toBe(0);
    expect(backend.upserts).toEqual([]);
    expect(localStorage.getItem(choiceCacheKey("tenant-a", "user-1"))).toBe(
      adminCache,
    );
    expect(result.current.answered).toBe(false);
  });

  it("keeps a view-as pick apart for each colleague viewed", async () => {
    backend.viewAsUserId = "user-2";
    const { result, rerender } = await mountSettled();
    act(() => result.current.saveBrain("grok"));
    await waitFor(() => expect(result.current.brainSlug).toBe("grok"));
    act(() => result.current.saveVoice("cedar"));
    await waitFor(() => expect(result.current.voice).toBe("cedar"));

    backend.viewAsUserId = "user-3";
    rerender();

    expect(result.current).toMatchObject({ brainSlug: null, voice: null });

    backend.viewAsUserId = "user-2";
    rerender();

    expect(result.current).toMatchObject({ brainSlug: "grok", voice: "cedar" });
    expect(backend.upserts).toEqual([]);
  });
});
