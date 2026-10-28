// Fake dependencies and requests for the Deno tests of handler.ts: fixture
// lines, a recording FileSendDeps, and the report and broadcast requests.
import { authorizeClientSend } from "../_shared/client-send/authorize.ts";
import { guardDb } from "../_shared/client-send/fake-guard-db.ts";
import type { GuardResult } from "../_shared/integration-guard.ts";
import type { SenderLine } from "../_shared/report-sender/line-store.ts";
import type { DeliverInput } from "./gateway.ts";
import type { FileSendDeps } from "./handler.ts";

export const TENANT = "tenant-dmm";
export const MEMBER = "user-member";
export const COLLEAGUE = "user-colleague";

const lines: Record<string, SenderLine> = {
  carmen: {
    id: "carmen",
    tenant_id: TENANT,
    user_id: MEMBER,
    api_key: "key-carmen",
    settings: { instance_id: "inst-carmen" },
  },
  colleaguePrivate: {
    id: "colleaguePrivate",
    tenant_id: TENANT,
    user_id: COLLEAGUE,
    api_key: "key-colleague",
    settings: { instance_id: "inst-colleague" },
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

/** What the steps that act were asked to do. */
type Calls = { uploads: number; delivered: DeliverInput[]; records: number };

/**
 * Deps over the fixture lines; records every step that acts. Carmen's line
 * serves every member, the colleague's private line only the colleague.
 */
export function fakeDeps(overrides: Partial<FileSendDeps> = {}) {
  const calls: Calls = { uploads: 0, delivered: [], records: 0 };
  const deps: FileSendDeps = {
    authenticate: async () => ({ kind: "user", userId: MEMBER }),
    store: {
      findActiveLine: async (id, type) =>
        type === "manus_wa" ? (lines[id] ?? null) : null,
      senderUsable: async (tenantId, id, userId) =>
        tenantId === TENANT &&
        (id === "carmen" ||
          (id === "colleaguePrivate" && userId === COLLEAGUE)),
      tenantCanUse: async (tenantId, id) => lines[id]?.tenant_id === tenantId,
      isMember: async (tenantId, userId) =>
        tenantId === TENANT && (userId === MEMBER || userId === COLLEAGUE),
      isSuperAdmin: async () => false,
    },
    ownManusLine: async (tenantId, userId) =>
      tenantId === TENANT && userId === MEMBER ? lines.carmen : null,
    resolveTenantId: async (request) => request.tenantId,
    findGroupChatId: async () => null,
    guard: () => ALLOW,
    clientSendGuard: (request) => authorizeClientSend(guardDb().db, request),
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
export function reportRequest(fields: Record<string, string>): Request {
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

/** A broadcast image: service role, JSON with a URL, sent as senderUserId. */
export function broadcastRequest(integrationId: string): Request {
  return new Request("https://functions.local/send-manus-wa-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      imageUrl: "https://cdn.local/promo.png",
      phoneNumber: "0501234567",
      tenantId: TENANT,
      integrationId,
      senderUserId: MEMBER,
    }),
  });
}

/** The status and JSON body of a response. */
export async function reply(response: Response) {
  return { status: response.status, body: await response.json() };
}
