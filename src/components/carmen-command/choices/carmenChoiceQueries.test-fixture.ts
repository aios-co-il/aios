// The stand-ins the choices tests run on: the signed-in user's
// carmen_user_choices row behind the Supabase client, who is signed in and
// viewed, and the error toast. Each test sets `backend` and reads what the
// hooks did to it.
import { vi } from "vitest";

interface StoredRow {
  brain_slug: string | null;
  voice: string | null;
}

interface FakeError {
  message: string;
}

interface Upsert {
  row: Partial<StoredRow> & { tenant_id?: string };
  options: unknown;
}

export const backend = {
  /** The user's row; null when they have none. */
  row: null as StoredRow | null,
  readError: null as FakeError | null,
  reads: 0,
  /** Holds each read's answer; a held read answers the row as it was when it began. */
  readGate: Promise.resolve(),
  upserts: [] as Array<Upsert>,
  /** The error each write answers, in the order of the writes; a write without one is stored. */
  writeErrors: [] as Array<FakeError | null>,
  /** Holds every write open until the test releases it. */
  writeGate: Promise.resolve(),
  /** The colleague a "view as" session previews. */
  viewAsUserId: null as string | null,
};

export const toastError = vi.fn<(message: string) => void>();

export const DENIED: FakeError = { message: "denied" };

/** A user without a row, a backend that answers at once, nobody viewed. */
export function resetBackend(): void {
  backend.row = null;
  backend.readError = null;
  backend.reads = 0;
  backend.readGate = Promise.resolve();
  backend.upserts = [];
  backend.writeErrors = [];
  backend.writeGate = Promise.resolve();
  backend.viewAsUserId = null;
  toastError.mockClear();
}

/** A gate for `readGate` or `writeGate`: the call waits on `closed` until `open()`. */
export function gate() {
  const handle = { closed: Promise.resolve(), open: () => {} };
  handle.closed = new Promise<void>((resolve) => {
    handle.open = resolve;
  });
  return handle;
}

export const fakeSupabase = {
  from: () => ({
    select: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: readRow }) }),
    }),
    upsert: writeRow,
  }),
};

/** useCurrentUser for the signed-in test user. */
export function fakeCurrentUser() {
  return { userId: "user-1" };
}

/** useViewAs for the colleague `backend.viewAsUserId` names, if any. */
export function fakeViewAs() {
  return {
    viewAsUserId: backend.viewAsUserId,
    isViewingAs: backend.viewAsUserId !== null,
  };
}

/** One read of the row. */
async function readRow() {
  backend.reads += 1;
  const answer = backend.readError
    ? { data: null, error: backend.readError }
    : { data: backend.row, error: null };

  await backend.readGate;
  return answer;
}

/** One upsert of a pick: recorded, then stored unless this write is refused. */
async function writeRow(row: Upsert["row"], options: unknown) {
  const error = backend.writeErrors[backend.upserts.length] ?? null;
  backend.upserts.push({ row, options });

  await backend.writeGate;
  if (!error) {
    backend.row = { brain_slug: null, voice: null, ...backend.row, ...row };
  }
  return { error };
}
