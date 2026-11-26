import { type DeviceActionDeps, handleDeviceAction } from "./handler.ts";
import {
  fakeDb,
  type FakeRow,
  type FakeTables,
} from "./action-db.test-fixture.ts";

export const ME = "11111111-1111-4111-8111-111111111111";
export const COLLEAGUE = "22222222-2222-4222-8222-222222222222";
export const TENANT = "33333333-3333-4333-8333-333333333333";
export const OTHER_TENANT = "66666666-6666-4666-8666-666666666666";
export const RUN = "44444444-4444-4444-8444-444444444444";
export const ACTION = "55555555-5555-4555-8555-555555555555";
export const NOW = new Date("2026-11-26T10:00:00.000Z");

export const CLAIM = { action: "claim", id: ACTION };
export const NOT_AVAILABLE = { error: "not_available" };
export const PAGE = { origin: "https://example.com", path: "/pricing" };
export const SNAPSHOT = {
  ...PAGE,
  snapshot_id: "s1",
  title: "Pricing",
  elements: [{ ref: "e1", role: "button", name: "Buy" }],
  text: "Plans and prices",
};
export const DONE = {
  action: "complete",
  id: ACTION,
  status: "done",
  decision: "free",
  observed: PAGE,
  result: SNAPSHOT,
};

export const SERVICE_TOKEN = "Bearer service";

const USER_BY_TOKEN: Record<string, string> = {
  "Bearer me": ME,
  "Bearer colleague": COLLEAGUE,
};

type Caller = Awaited<ReturnType<DeviceActionDeps["caller"]>>;

/** A pending read-page action of mine that expires in two minutes, with `overrides`. */
export function actionRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: ACTION,
    tenant_id: TENANT,
    user_id: ME,
    run_id: RUN,
    tool: "browser_read_page",
    arguments: {},
    status: "pending",
    expires_at: new Date(NOW.getTime() + 120_000).toISOString(),
    ...overrides,
  };
}

/**
 * Tables holding one action and the given stops, and deps over them: each caller reads only
 * their own rows. `failing` names a table whose queries fail. `callerReads` is a row the
 * caller's own read returns whatever the table holds: row-level security gone wrong, or a
 * row that changed after it was read.
 */
export function world(
  action: FakeRow = actionRow(),
  options: {
    stops?: Array<FakeRow>;
    failing?: string;
    callerReads?: FakeRow;
  } = {},
) {
  const tables: FakeTables = {
    carmen_device_actions: [action],
    carmen_run_cancellations: options.stops ?? [],
  };
  const deps: DeviceActionDeps = {
    caller: (req) =>
      Promise.resolve(callerOf(req.headers.get("Authorization") ?? "")),
    userDb: (authorization) =>
      options.callerReads
        ? fakeDb({ carmen_device_actions: [options.callerReads] })
        : fakeDb(
            tables,
            (row) => row.user_id === USER_BY_TOKEN[authorization],
            options.failing,
          ),
    serviceDb: () => fakeDb(tables, undefined, options.failing),
    now: () => NOW,
  };
  return { action, deps };
}

/** A POST of `body` as the token's user. */
export function post(body: unknown, token = "Bearer me"): Request {
  return new Request("http://local/carmen-device-action", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Who a token is, as `requireAuth` answers: a user, the service key, or nobody. */
function callerOf(authorization: string): Caller {
  if (authorization === SERVICE_TOKEN) {
    return { kind: "service", userId: null };
  }
  const userId = USER_BY_TOKEN[authorization];

  return userId ? { kind: "user", userId } : null;
}

/** The status and JSON body of the handler's answer. */
export async function answer(request: Request, deps: DeviceActionDeps) {
  const response = await handleDeviceAction(request, deps);
  return { status: response.status, body: await response.json() };
}
