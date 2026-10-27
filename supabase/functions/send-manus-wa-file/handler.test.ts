import { assertEquals } from "jsr:@std/assert@1";
import { authorizeClientSend } from "../_shared/client-send/authorize.ts";
import {
  CLIENT,
  guardDb,
  refusalRows,
  resolved,
} from "../_shared/client-send/fake-guard-db.ts";
import type { ClientSendRequest } from "../_shared/client-send/types.ts";
import type { GuardResult } from "../_shared/integration-guard.ts";
import type { SenderLine } from "../_shared/report-sender/line-access.ts";
import type { DeliverInput } from "./gateway.ts";
import { type FileSendDeps, handleFileSend } from "./handler.ts";

const TENANT = "tenant-dmm";
const MEMBER = "user-member";

const lines: Record<string, SenderLine> = {
  carmen: {
    id: "carmen",
    tenant_id: TENANT,
    user_id: MEMBER,
    api_key: "key-carmen",
    settings: { instance_id: "inst-carmen" },
  },
  foreign: {
    id: "foreign",
    tenant_id: "tenant-other",
    user_id: "user-other",
    api_key: "key-foreign",
    settings: { instance_id: "inst-foreign" },
  },
};

const ALLOW: GuardResult = {
  decision: "ALLOW",
  reason: "production",
  environment: "production",
};

/** Deps over the fixture lines; records every step that acts. */
function fakeDeps(overrides: Partial<FileSendDeps> = {}) {
  const calls = { uploads: 0, delivered: [] as DeliverInput[], records: 0 };
  const deps: FileSendDeps = {
    authenticate: async () => ({ kind: "user", userId: MEMBER }),
    store: {
      findActiveLine: async (id, type) =>
        type === "manus_wa" ? (lines[id] ?? null) : null,
      senderUsable: async (tenantId, id) =>
        tenantId === TENANT && id === "carmen",
      isMember: async (tenantId, userId) =>
        tenantId === TENANT && userId === MEMBER,
      isSuperAdmin: async () => false,
    },
    ownManusLine: async (tenantId, userId) =>
      tenantId === TENANT && userId === MEMBER ? lines.carmen : null,
    resolveTenantId: async (request) => request.tenantId,
    findGroupChatId: async () => null,
    guard: () => ALLOW,
    authorizeClientSend: (request) =>
      authorizeClientSend(guardDb().db, request),
    upload: async () => {
      calls.uploads += 1;
      return "https://storage.local/signed";
    },
    deliver: async (input) => {
      calls.delivered.push(input);
      return { status: "sent", messageId: "m-1", deliveredAs: "media" };
    },
    record: async () => {
      calls.records += 1;
    },
    ...overrides,
  };
  return { deps, calls };
}

/** A browser report send: a screenshot as multipart. */
function reportRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  form.append(
    "file",
    new File([new Uint8Array([1, 2, 3])], "report.png", { type: "image/png" }),
  );
  for (const [key, value] of Object.entries({
    tenantId: TENANT,
    phoneNumber: "050-1234567",
    ...fields,
  })) {
    form.append(key, value);
  }
  return new Request("https://functions.local/send-manus-wa-file", {
    method: "POST",
    headers: { Authorization: "Bearer user-jwt" },
    body: form,
  });
}

/** The status and JSON body of a response. */
async function reply(response: Response) {
  return { status: response.status, body: await response.json() };
}

Deno.test("handleFileSend refuses before anything is uploaded", async (t) => {
  await t.step("a caller who is not a member of the tenant", async () => {
    const { deps, calls } = fakeDeps({
      authenticate: async () => ({ kind: "user", userId: "user-stranger" }),
    });
    const result = await reply(
      await handleFileSend(reportRequest({ integrationId: "carmen" }), deps),
    );
    assertEquals(result, {
      status: 403,
      body: { error: "Forbidden", code: "forbidden" },
    });
    assertEquals(calls, { uploads: 0, delivered: [], records: 0 });
  });

  await t.step("a service call on behalf of a non-member", async () => {
    const { deps, calls } = fakeDeps({
      authenticate: async () => ({ kind: "service", userId: null }),
    });
    const result = await handleFileSend(
      reportRequest({ senderUserId: "user-stranger" }),
      deps,
    );
    assertEquals(result.status, 403);
    assertEquals(calls.uploads, 0);
  });

  await t.step("another tenant's line, never swapped for one", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reply(
      await handleFileSend(reportRequest({ integrationId: "foreign" }), deps),
    );
    assertEquals(result, {
      status: 403,
      body: { error: "sender_not_allowed", code: "sender_not_allowed" },
    });
    assertEquals(calls, { uploads: 0, delivered: [], records: 0 });
  });

  await t.step("Staging blocks the recipient", async () => {
    const destinations: string[] = [];
    const { deps, calls } = fakeDeps({
      guard: (destination) => {
        destinations.push(destination);
        return {
          decision: "BLOCK",
          reason: "not_in_allowlist",
          environment: "staging",
        };
      },
    });
    const result = await reply(
      await handleFileSend(reportRequest({ integrationId: "carmen" }), deps),
    );
    assertEquals(result.status, 403);
    assertEquals(result.body.error, "blocked_by_staging_safe_mode");
    assertEquals(destinations, ["972501234567"]);
    assertEquals(calls, { uploads: 0, delivered: [], records: 0 });
  });
});

Deno.test("handleFileSend sends from the resolved line", async (t) => {
  await t.step("the named line", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reply(
      await handleFileSend(reportRequest({ integrationId: "carmen" }), deps),
    );
    assertEquals(result, {
      status: 200,
      body: { success: true, messageId: "m-1", delivered_as: "media" },
    });
    assertEquals(calls.uploads, 1);
    assertEquals(calls.records, 1);
    assertEquals(calls.delivered[0].instanceId, "inst-carmen");
    assertEquals(calls.delivered[0].to, "972501234567");
    assertEquals(calls.delivered[0].media.url, "https://storage.local/signed");
  });

  await t.step(
    "without a named line, the caller's own Manus line",
    async () => {
      const { deps, calls } = fakeDeps();
      const result = await handleFileSend(reportRequest({}), deps);
      assertEquals(result.status, 200);
      assertEquals(calls.delivered[0].apiKey, "key-carmen");
    },
  );

  await t.step("an unknown delivery is reported, not recorded", async () => {
    const { deps, calls } = fakeDeps({
      deliver: async () => ({ status: "unknown", detail: "TimeoutError" }),
    });
    const result = await reply(
      await handleFileSend(reportRequest({ integrationId: "carmen" }), deps),
    );
    assertEquals(result.status, 202);
    assertEquals(result.body.delivered, "unknown");
    assertEquals(calls.records, 0);
  });
});

Deno.test("handleFileSend asks the client send guard first", async (t) => {
  await t.step("a staff alert to a client is refused, never sent", async () => {
    const requests: ClientSendRequest[] = [];
    const guard = guardDb({ recipient: resolved("client", [CLIENT]) });
    const { deps, calls } = fakeDeps({
      authenticate: async () => ({ kind: "service", userId: null }),
      authorizeClientSend: (request) => {
        requests.push(request);
        return authorizeClientSend(guard.db, request);
      },
    });
    const result = await reply(
      await handleFileSend(
        reportRequest({
          senderUserId: MEMBER,
          integrationId: "carmen",
          sendKind: "staff_alert",
          clientId: CLIENT,
        }),
        deps,
      ),
    );
    assertEquals(result, {
      status: 403,
      body: { error: "client_send_not_authorized", reason: "staff_only" },
    });
    assertEquals(calls, { uploads: 0, delivered: [], records: 0 });
    assertEquals(requests, [
      {
        functionName: "send-manus-wa-file",
        tenantId: TENANT,
        channel: "whatsapp",
        address: "972501234567",
        groupId: null,
        origin: "system",
        sendKind: "staff_alert",
        sendRef: null,
        subjectClientId: CLIENT,
      },
    ]);
    assertEquals(refusalRows(guard.writes).length, 1);
  });

  await t.step("a person's report to a client goes out", async () => {
    const guard = guardDb({ recipient: resolved("client", [CLIENT]) });
    const { deps, calls } = fakeDeps({
      authorizeClientSend: (request) => authorizeClientSend(guard.db, request),
    });
    const result = await handleFileSend(
      reportRequest({ integrationId: "carmen", sendKind: "report" }),
      deps,
    );
    assertEquals(result.status, 200);
    assertEquals(calls.delivered.length, 1);
    assertEquals(guard.rpcCalls, []);
  });
});
