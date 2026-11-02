import { assertEquals } from "jsr:@std/assert@1";
import { authorizeClientSend } from "../_shared/client-send/authorize.ts";
import {
  CLIENT,
  guardDb,
  refusalRows,
  resolved,
} from "../_shared/client-send/fake-guard-db.ts";
import type { ClientSendRequest } from "../_shared/client-send/types.ts";
import {
  broadcastRequest,
  COLLEAGUE,
  fakeDeps,
  MEMBER,
  reply,
  reportRequest,
  TENANT,
} from "./fake-deps.ts";
import { handleFileSend } from "./handler.ts";

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

  await t.step("another member's private line", async () => {
    const { deps, calls } = fakeDeps();
    const result = await reply(
      await handleFileSend(
        reportRequest({ integrationId: "colleaguePrivate" }),
        deps,
      ),
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

  await t.step("a private line, for its owner", async () => {
    const { deps, calls } = fakeDeps({
      authenticate: async () => ({ kind: "user", userId: COLLEAGUE }),
    });
    const result = await handleFileSend(
      reportRequest({ integrationId: "colleaguePrivate" }),
      deps,
    );
    assertEquals(result.status, 200);
    assertEquals(calls.delivered[0].apiKey, "key-colleague");
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

  await t.step(
    "a broadcast image from any line of the tenant, as before",
    async () => {
      // The broadcast wizard offers every line of the tenant; the member's
      // own rule applies to members' calls, not to broadcasts.
      const { deps, calls } = fakeDeps({
        authenticate: async () => ({ kind: "service", userId: null }),
      });
      const result = await handleFileSend(
        broadcastRequest("colleaguePrivate"),
        deps,
      );
      assertEquals(result.status, 200);
      assertEquals(calls.delivered[0].apiKey, "key-colleague");
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

  await t.step("a gateway failure keeps the gateway's reply out", async () => {
    const { deps } = fakeDeps({
      deliver: async () => ({ status: "failed", detail: "upstream secret" }),
    });
    const result = await reply(
      await handleFileSend(reportRequest({ integrationId: "carmen" }), deps),
    );
    assertEquals(result.body, { error: "Manus WA error", code: "send_failed" });
  });
});

Deno.test("handleFileSend asks the client send guard first", async (t) => {
  await t.step("a staff alert to a client is refused, never sent", async () => {
    const requests: ClientSendRequest[] = [];
    const guard = guardDb({ recipient: resolved("client", [CLIENT]) });
    const { deps, calls } = fakeDeps({
      authenticate: async () => ({ kind: "service", userId: null }),
      clientSendGuard: (request) => {
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
      clientSendGuard: (request) => authorizeClientSend(guard.db, request),
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
