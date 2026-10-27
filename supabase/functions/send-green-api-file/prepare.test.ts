import { assertEquals } from "jsr:@std/assert@1";
import { authorizeClientSend } from "../_shared/client-send/authorize.ts";
import {
  CLIENT,
  guardDb,
  resolved,
} from "../_shared/client-send/fake-guard-db.ts";
import type { ClientSendRequest } from "../_shared/client-send/types.ts";
import type { GuardResult } from "../_shared/integration-guard.ts";
import type { SenderLine } from "../_shared/report-sender/line-access.ts";
import {
  type GreenFileSendDeps,
  type GreenFileSendInput,
  prepareGreenFileSend,
} from "./prepare.ts";

const TENANT = "tenant-a";
const MEMBER = "user-member";
const GROUP = "66666666-6666-4666-8666-666666666666";

/** An active Green API line of this tenant, owned by the member. */
const line = (id: string, tenant_id: string): SenderLine => ({
  id,
  tenant_id,
  user_id: MEMBER,
  api_key: "token",
  settings: { instance_id: `inst-${id}` },
});

const lines: Record<string, SenderLine> = {
  own: line("own", TENANT),
  foreign: line("foreign", "tenant-c"),
};

const ALLOW: GuardResult = {
  decision: "ALLOW",
  reason: "production",
  environment: "production",
};

/** Deps over the fixture lines; the legacy pick is the caller's own line. */
function deps(overrides: Partial<GreenFileSendDeps> = {}): GreenFileSendDeps {
  return {
    store: {
      findActiveLine: async (id, type) =>
        type === "green_api" ? (lines[id] ?? null) : null,
      senderUsable: async (tenantId, id) => tenantId === TENANT && id === "own",
      isMember: async (tenantId, userId) =>
        tenantId === TENANT && userId === MEMBER,
      isSuperAdmin: async () => false,
    },
    legacyLine: async () => lines.own,
    guard: () => ALLOW,
    clientSendGuard: (request) => authorizeClientSend(guardDb().db, request),
    ...overrides,
  };
}

const send: GreenFileSendInput = {
  tenantId: TENANT,
  userId: MEMBER,
  integrationId: "own",
  groupId: null,
  groupChatId: undefined,
  phoneNumber: "0501234567",
  clientId: CLIENT,
  isServiceRole: false,
  sendKind: "report",
  sendRef: null,
};

Deno.test("prepareGreenFileSend refuses", async (t) => {
  await t.step("a caller who is not a member of the tenant", async () => {
    assertEquals(
      await prepareGreenFileSend(deps(), { ...send, userId: "user-stranger" }),
      {
        refusal: {
          status: 403,
          body: { error: "Forbidden", code: "forbidden" },
        },
      },
    );
  });

  await t.step("another tenant's line, never swapped for one", async () => {
    assertEquals(
      await prepareGreenFileSend(deps(), { ...send, integrationId: "foreign" }),
      {
        refusal: {
          status: 403,
          body: { error: "sender_not_allowed", code: "sender_not_allowed" },
        },
      },
    );
  });

  await t.step("a recipient Staging may not send to", async () => {
    const destinations: string[] = [];
    const result = await prepareGreenFileSend(
      deps({
        guard: (destination) => {
          destinations.push(destination);
          return {
            decision: "BLOCK",
            reason: "not_in_allowlist",
            environment: "staging",
          };
        },
      }),
      send,
    );
    assertEquals(destinations, ["972501234567@c.us"]);
    assertEquals(
      "refusal" in result ? result.refusal.body.error : null,
      "blocked_by_staging_safe_mode",
    );
  });

  await t.step("a send with no recipient", async () => {
    const result = await prepareGreenFileSend(deps(), {
      ...send,
      phoneNumber: null,
    });
    assertEquals("refusal" in result ? result.refusal.status : null, 400);
  });
});

Deno.test("prepareGreenFileSend resolves the line and chat", async (t) => {
  await t.step("the named line, to a group", async () => {
    const result = await prepareGreenFileSend(deps(), {
      ...send,
      groupId: "group-1",
      groupChatId: "120363416882903532@g.us",
    });
    assertEquals(result, {
      line: lines.own,
      chatId: "120363416882903532@g.us",
      usedGroupChat: true,
    });
  });

  await t.step("without a named line, the legacy pick", async () => {
    const result = await prepareGreenFileSend(deps(), {
      ...send,
      integrationId: null,
    });
    assertEquals("line" in result ? result.line.id : null, "own");
  });
});

Deno.test("prepareGreenFileSend asks the client send guard", async (t) => {
  await t.step("a person's report to a client, without a lookup", async () => {
    const requests: ClientSendRequest[] = [];
    const guard = guardDb({ recipient: resolved("client", [CLIENT]) });
    const result = await prepareGreenFileSend(
      deps({
        clientSendGuard: (request) => {
          requests.push(request);
          return authorizeClientSend(guard.db, request);
        },
      }),
      send,
    );
    assertEquals("line" in result, true);
    assertEquals(requests, [
      {
        functionName: "send-green-api-file",
        tenantId: TENANT,
        channel: "whatsapp",
        address: "972501234567@c.us",
        groupId: null,
        origin: "person",
        sendKind: "report",
        sendRef: null,
        subjectClientId: CLIENT,
      },
    ]);
    assertEquals(guard.rpcCalls, []);
  });

  await t.step("the group row only when the file goes there", async () => {
    const requests: ClientSendRequest[] = [];
    const recording = deps({
      clientSendGuard: (request) => {
        requests.push(request);
        return authorizeClientSend(guardDb().db, request);
      },
    });
    await prepareGreenFileSend(recording, {
      ...send,
      groupId: GROUP,
      groupChatId: "120363416882903532@g.us",
    });
    await prepareGreenFileSend(recording, { ...send, groupId: GROUP });
    assertEquals(
      requests.map((request) => [request.address, request.groupId]),
      [
        ["120363416882903532@g.us", GROUP],
        ["972501234567@c.us", null],
      ],
    );
  });

  await t.step("a service-role send, as the auth step says", async () => {
    const requests: ClientSendRequest[] = [];
    await prepareGreenFileSend(
      deps({
        clientSendGuard: (request) => {
          requests.push(request);
          return authorizeClientSend(guardDb().db, request);
        },
      }),
      { ...send, isServiceRole: true },
    );
    assertEquals(
      requests.map((request) => request.origin),
      ["system"],
    );
  });

  await t.step("a refusal stops the send before Green API", async () => {
    const destinations: string[] = [];
    const result = await prepareGreenFileSend(
      deps({
        clientSendGuard: async () => ({
          allowed: false,
          reason: "staff_only",
          recipient: null,
        }),
        guard: (destination) => {
          destinations.push(destination);
          return ALLOW;
        },
      }),
      send,
    );
    assertEquals(result, {
      refusal: {
        status: 403,
        body: { error: "client_send_not_authorized", reason: "staff_only" },
      },
    });
    assertEquals(destinations, []);
  });
});
