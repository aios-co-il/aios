/**
 * A fake Chrome, card and carmen-device-action for readActions.test.ts: each call is
 * recorded, and each answer can be replaced per test.
 */
import { vi } from "vitest";
import type { CompleteBody } from "./completion.ts";
import type { ClaimAnswer, ReadActionDeps } from "./readActions.ts";
import type { GrantAnswer, TabFacts } from "./readFlow.ts";

export const ACTION_ID = "0b5e8f7a-3c1d-4e2f-9a8b-7c6d5e4f3a2b";
export const PAGE_URL = "https://shop.example/items?token=secret";

/** A controllable card: resolves when the test answers, or when the step is stopped. */
export type FakeCard = {
  shown: Array<{ host: string; pattern: string }>;
  answer: (answer: GrantAnswer) => void;
};

/** The fake deps plus the handles a test inspects. */
export type FakeDevice = {
  deps: ReadActionDeps;
  completed: Array<CompleteBody>;
  closingCompletions: Array<CompleteBody>;
  posted: Array<string>;
  card: FakeCard;
  /** The tab's address from now on, as Chrome would report it. */
  setTabUrl: (url: string | undefined) => void;
  /** Fires the expiry timer. */
  expire: () => void;
};

/** A fake device on a granted https page, with a claim that succeeds for a read. */
export function fakeDevice(
  overrides: Partial<ReadActionDeps> = {},
): FakeDevice {
  let tabUrl: string | undefined = PAGE_URL;
  let expiry: (() => void) | null = null;
  let answerCard: ((answer: GrantAnswer) => void) | null = null;
  const completed: Array<CompleteBody> = [];
  const closingCompletions: Array<CompleteBody> = [];
  const posted: Array<string> = [];
  const card: FakeCard = {
    shown: [],
    answer: (answer) => answerCard?.(answer),
  };

  /** The tab as Chrome reports it now. */
  function currentTab(): TabFacts {
    return { id: 7, url: tabUrl, title: "Items | Shop" };
  }

  const deps: ReadActionDeps = {
    origins: {
      appOrigins: ["https://aios.co.il"],
      backendOrigins: ["https://api.aios.co.il"],
    },
    claim: vi.fn(async (): Promise<ClaimAnswer> => ({
      ok: true,
      tool: "browser_read_page",
    })),
    complete: vi.fn(async (body: CompleteBody) => {
      completed.push(body);
    }),
    completeOnClose: vi.fn((body: CompleteBody) => {
      closingCompletions.push(body);
    }),
    postResult: vi.fn((id: string) => {
      posted.push(id);
    }),
    activeTab: vi.fn(async () => currentTab()),
    tab: vi.fn(async () => currentTab()),
    hasGrant: vi.fn(async () => true),
    askGrant: vi.fn(
      (site: { host: string; pattern: string }, signal: AbortSignal) =>
        new Promise<GrantAnswer>((resolve) => {
          card.shown.push(site);
          answerCard = resolve;
          signal.addEventListener("abort", () => resolve("stopped"));
        }),
    ),
    readPage: vi.fn(async () => ({
      text: "Item one  costs 10",
      elements: [{ role: "button", name: "Buy" }],
    })),
    newSnapshotId: () => "snapshot-1",
    setTimer: (run: () => void) => {
      expiry = run;
      return () => {
        expiry = null;
      };
    },
    ...overrides,
  };

  return {
    deps,
    completed,
    closingCompletions,
    posted,
    card,
    setTabUrl: (url) => {
      tabUrl = url;
    },
    expire: () => expiry?.(),
  };
}

/** Lets pending promise callbacks run, so a step reaches its next wait. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await Promise.resolve();
  }
}
