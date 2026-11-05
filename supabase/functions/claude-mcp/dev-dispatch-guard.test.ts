import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import {
  DEV_DISPATCH_WINDOW_SECONDS,
  type DevDispatchRequest,
  dispatchDevTaskOnce,
  duplicateReply,
} from "./dev-dispatch-guard.ts";

type Row = Record<string, unknown>;

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";

/**
 * In-memory claude_dispatches with claim_claude_dev_dispatch's rule (same
 * tenant, same task, not failed, inside the window) and a clock tests move.
 */
function fakeDispatchDb(
  opts: { rpcError?: string; updateError?: string } = {},
) {
  const rows: Row[] = [];
  const clock = { now: Date.parse("2026-11-02T10:00:00Z") };
  return {
    rows,
    clock,
    rpc(fn: string, args: Row) {
      if (opts.rpcError || fn !== "claim_claude_dev_dispatch") {
        return Promise.resolve({
          data: null,
          error: { message: opts.rpcError ?? `unknown rpc ${fn}` },
        });
      }
      const since = clock.now - Number(args.p_window_seconds) * 1000;
      const existing = rows.find(
        (row) =>
          row.tenant_id === args.p_tenant_id &&
          row.request_text === args.p_request_text &&
          row.status !== "failed" &&
          Number(row.created_at) >= since,
      );
      if (existing) {
        return Promise.resolve({
          data: [
            {
              dispatch_id: existing.id,
              claimed: false,
              existing_session_url: existing.session_url ?? null,
            },
          ],
          error: null,
        });
      }
      const id = `dispatch-${rows.length + 1}`;
      rows.push({
        id,
        tenant_id: args.p_tenant_id,
        request_text: args.p_request_text,
        status: "dispatching",
        created_at: clock.now,
      });
      return Promise.resolve({
        data: [{ dispatch_id: id, claimed: true, existing_session_url: null }],
        error: null,
      });
    },
    from(_table: string) {
      let patch: Row = {};
      const filters: Row = {};
      const b = {
        update(values: Row) {
          patch = values;
          return b;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return b;
        },
        then(resolve: (value: unknown) => unknown) {
          if (!opts.updateError) {
            rows
              .filter((row) =>
                Object.entries(filters).every(([k, v]) => row[k] === v),
              )
              .forEach((row) => Object.assign(row, patch));
          }
          const error = opts.updateError ? { message: opts.updateError } : null;
          return Promise.resolve({ error }).then(resolve);
        },
      };
      return b;
    },
  };
}

/** A routine fire that counts its calls and returns a new session link each time. */
function fakeFire() {
  const fire = () => {
    fire.calls += 1;
    return Promise.resolve(`https://claude.ai/code/session-${fire.calls}`);
  };
  fire.calls = 0;
  return fire;
}

const request = (overrides: Partial<DevDispatchRequest> = {}) => ({
  tenantId: TENANT,
  agentId: null,
  task: "Fix the login bug",
  context: "",
  branch: "",
  ...overrides,
});

describe("dispatchDevTaskOnce", () => {
  it("returns the first session for a repeat within 15 minutes", async () => {
    const db = fakeDispatchDb();
    const fire = fakeFire();
    const first = await dispatchDevTaskOnce(db, request(), fire);
    db.clock.now += 14 * 60 * 1000;
    const again = await dispatchDevTaskOnce(db, request(), fire);
    assertEquals(first, {
      duplicate: false,
      sessionUrl: "https://claude.ai/code/session-1",
    });
    assertEquals(again, {
      duplicate: true,
      sessionUrl: "https://claude.ai/code/session-1",
    });
    assertEquals(fire.calls, 1);
    assertEquals(db.rows[0].status, "dispatched");
  });

  it("opens a new session for a repeat after 15 minutes", async () => {
    const db = fakeDispatchDb();
    const fire = fakeFire();
    await dispatchDevTaskOnce(db, request(), fire);
    db.clock.now += (DEV_DISPATCH_WINDOW_SECONDS + 60) * 1000;
    const again = await dispatchDevTaskOnce(db, request(), fire);
    assertEquals(again, {
      duplicate: false,
      sessionUrl: "https://claude.ai/code/session-2",
    });
    assertEquals(fire.calls, 2);
  });

  it("opens a new session for the same task from another tenant", async () => {
    const db = fakeDispatchDb();
    const fire = fakeFire();
    await dispatchDevTaskOnce(db, request(), fire);
    const other = await dispatchDevTaskOnce(
      db,
      request({ tenantId: OTHER_TENANT }),
      fire,
    );
    assertEquals(other.duplicate, false);
    assertEquals(fire.calls, 2);
  });

  it("throws and fires nothing when the reservation fails", async () => {
    const db = fakeDispatchDb({ rpcError: "connection refused" });
    const fire = fakeFire();
    await assertRejects(
      () => dispatchDevTaskOnce(db, request(), fire),
      Error,
      "Could not check for a duplicate dev task",
    );
    assertEquals(fire.calls, 0);
  });

  it("marks a failed fire so a retry opens a session", async () => {
    const db = fakeDispatchDb();
    await assertRejects(() =>
      dispatchDevTaskOnce(db, request(), () =>
        Promise.reject(new Error("routine 500")),
      ),
    );
    assertEquals(db.rows[0].status, "failed");
    const fire = fakeFire();
    const retry = await dispatchDevTaskOnce(db, request(), fire);
    assertEquals(retry.duplicate, false);
    assertEquals(fire.calls, 1);
  });

  it("still returns the session link when its status cannot be recorded", async () => {
    const db = fakeDispatchDb({ updateError: "timeout" });
    const out = await dispatchDevTaskOnce(db, request(), fakeFire());
    assertEquals(out, {
      duplicate: false,
      sessionUrl: "https://claude.ai/code/session-1",
    });
  });
});

describe("duplicateReply", () => {
  it("gives Carmen the existing session link", () => {
    const reply = duplicateReply("https://claude.ai/code/session-1");
    assertEquals(
      reply.endsWith("Existing session: https://claude.ai/code/session-1"),
      true,
    );
  });

  it("says the link is not ready while the first fire is running", () => {
    assertEquals(duplicateReply(null).includes("not ready yet"), true);
  });
});
