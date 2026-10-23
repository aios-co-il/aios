import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Buffer } from "node:buffer";
import {
  type DeletionRequestStatus,
  type DeletionRequestStore,
  type MetaDataDeletionDeps,
  type NewDeletionRequest,
  handleMetaDataDeletion,
  parseRequest,
} from "./meta-data-deletion.ts";
import { hmacSha256 } from "./meta-signed-request.ts";

const SECRET = "test-app-secret";
const STATUS_PAGE = "https://example.test/data-deletion";
const FUNCTION_URL = "https://example.test/functions/v1/meta-data-deletion";

const STORED: DeletionRequestStatus = {
  confirmation_code: "abc123",
  status: "received",
  created_at: "2026-10-22T10:00:00.000Z",
};

async function sign(payload: Record<string, unknown>, secret = SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = await hmacSha256(secret, encodedPayload);
  return `${Buffer.from(signature).toString("base64url")}.${encodedPayload}`;
}

function fakeStore(
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

function deps(overrides: Partial<MetaDataDeletionDeps> = {}) {
  return {
    store: fakeStore(),
    appSecret: SECRET,
    statusPage: STATUS_PAGE,
    ...overrides,
  };
}

function get(query: string) {
  return new Request(`${FUNCTION_URL}${query}`, { method: "GET" });
}

function postForm(signedRequest: string) {
  const body = new URLSearchParams({ signed_request: signedRequest });
  return new Request(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

function postJson(body: unknown) {
  return new Request(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleMetaDataDeletion: status lookup (GET)", () => {
  test("returns the stored row for a known code", async () => {
    const res = await handleMetaDataDeletion(get("?code=abc123"), deps());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), STORED);
  });

  test("trims the code before looking it up", async () => {
    const res = await handleMetaDataDeletion(get("?code=%20abc123%20"), deps());
    assert.equal(res.status, 200);
  });

  test("returns 400 without a code", async () => {
    const res = await handleMetaDataDeletion(get(""), deps());
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "code is required" });
  });

  test("returns 404 for an unknown code", async () => {
    const res = await handleMetaDataDeletion(get("?code=nope"), deps());
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "Unknown confirmation code" });
  });

  test("returns a fixed 500 when the store fails", async () => {
    const store = fakeStore({
      async findByCode() {
        throw new Error("connection refused");
      },
    });
    const res = await handleMetaDataDeletion(
      get("?code=abc123"),
      deps({ store }),
    );
    assert.equal(res.status, 500);
    // The /data-deletion page maps any non-404 failure to "could not check the
    // status right now"; the DB error text must not leak to the client.
    assert.deepEqual(await res.json(), { error: "Internal error" });
  });
});

describe("handleMetaDataDeletion: Meta callback (POST)", () => {
  const PAYLOAD = {
    algorithm: "HMAC-SHA256",
    issued_at: 1761130000,
    user_id: "1234567890",
  };

  test("logs a valid form-encoded request and answers with url + code", async () => {
    const store = fakeStore();
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD)),
      deps({ store }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      url: string;
      confirmation_code: string;
    };
    assert.match(body.confirmation_code, /^[0-9a-f]{16}$/);
    assert.equal(body.url, `${STATUS_PAGE}?code=${body.confirmation_code}`);
    assert.equal(store.inserted.length, 1);
    assert.deepEqual(store.inserted[0], {
      fb_user_id: "1234567890",
      confirmation_code: body.confirmation_code,
      status: "received",
      issued_at: new Date(PAYLOAD.issued_at * 1000).toISOString(),
    });
  });

  test("stores a null issued_at when the payload has none or it is invalid", async () => {
    const store = fakeStore();
    const { issued_at: _omit, ...withoutIssuedAt } = PAYLOAD;
    await handleMetaDataDeletion(
      postForm(await sign(withoutIssuedAt)),
      deps({ store }),
    );
    await handleMetaDataDeletion(
      postForm(await sign({ ...PAYLOAD, issued_at: "soon" })),
      deps({ store }),
    );
    assert.equal(store.inserted[0]?.issued_at, null);
    assert.equal(store.inserted[1]?.issued_at, null);
  });

  test("accepts a JSON body too", async () => {
    const res = await handleMetaDataDeletion(
      postJson({ signed_request: await sign(PAYLOAD) }),
      deps(),
    );
    assert.equal(res.status, 200);
  });

  test("stores a null fb_user_id when the payload has none", async () => {
    const store = fakeStore();
    const { user_id: _omit, ...withoutUser } = PAYLOAD;
    await handleMetaDataDeletion(
      postForm(await sign(withoutUser)),
      deps({ store }),
    );
    assert.equal(store.inserted[0]?.fb_user_id, null);
  });

  test("rejects a request signed with another secret", async () => {
    const store = fakeStore();
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD, "other-secret")),
      deps({ store }),
    );
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid signed_request" });
    assert.equal(store.inserted.length, 0);
  });

  test("rejects a body without signed_request", async () => {
    const res = await handleMetaDataDeletion(postJson({}), deps());
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid signed_request" });
  });

  test("returns 500 Not configured without an app secret", async () => {
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD)),
      deps({ appSecret: undefined }),
    );
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Not configured" });
  });

  test("returns a fixed 500 when the insert fails", async () => {
    const store = fakeStore({
      async insert() {
        throw new Error("duplicate key");
      },
    });
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD)),
      deps({ store }),
    );
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Internal error" });
  });
});

describe("handleMetaDataDeletion: other methods", () => {
  test("answers OPTIONS with CORS headers and no body", async () => {
    const res = await handleMetaDataDeletion(
      new Request(FUNCTION_URL, { method: "OPTIONS" }),
      deps(),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(await res.text(), "");
  });

  test("returns 405 for other methods", async () => {
    const res = await handleMetaDataDeletion(
      new Request(FUNCTION_URL, { method: "DELETE" }),
      deps(),
    );
    assert.equal(res.status, 405);
  });
});

describe("parseRequest", () => {
  test("returns null for an unparseable form body", async () => {
    const req = new Request(FUNCTION_URL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not a form",
    });
    assert.equal(await parseRequest(req, SECRET), null);
  });

  test("returns null for malformed JSON", async () => {
    const req = new Request(FUNCTION_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(await parseRequest(req, SECRET), null);
  });
});
