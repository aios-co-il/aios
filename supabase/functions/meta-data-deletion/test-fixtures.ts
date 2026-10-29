import { Buffer } from "node:buffer";
import type { DeletionRequestStatus } from "./contract.ts";
import type {
  DeletionRequestStore,
  MetaDataDeletionDeps,
  NewDeletionRequest,
} from "./handler.ts";
import { hmacSha256 } from "./signed-request.ts";

export const SECRET = "test-app-secret";
export const STATUS_PAGE = "https://example.test/data-deletion";
export const FUNCTION_URL =
  "https://example.test/functions/v1/meta-data-deletion";

export const STORED: DeletionRequestStatus = {
  confirmation_code: "0123456789abcdef",
  status: "received",
  created_at: "2026-10-22T10:00:00.000Z",
};

export async function sign(payload: Record<string, unknown>, secret = SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = await hmacSha256(secret, encodedPayload);
  return `${Buffer.from(signature).toString("base64url")}.${encodedPayload}`;
}

export function fakeStore(
  overrides: Partial<DeletionRequestStore> = {},
): DeletionRequestStore & { inserted: NewDeletionRequest[] } {
  const inserted: NewDeletionRequest[] = [];
  return {
    inserted,
    async findByCode(code) {
      return code === STORED.confirmation_code ? STORED : null;
    },
    async insert(row) {
      inserted.push(row);
    },
    ...overrides,
  };
}

export function deps(overrides: Partial<MetaDataDeletionDeps> = {}) {
  return {
    store: fakeStore(),
    appSecret: SECRET,
    statusPage: STATUS_PAGE,
    ...overrides,
  };
}

export function get(query: string) {
  return new Request(`${FUNCTION_URL}${query}`, { method: "GET" });
}

export function postForm(signedRequest: string) {
  const body = new URLSearchParams({ signed_request: signedRequest });
  return new Request(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

export function postJson(body: unknown) {
  return new Request(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
