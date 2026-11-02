import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { handleMetaDataDeletion } from "./handler.ts";
import {
  STATUS_PAGE,
  sign,
  fakeStore,
  deps,
  postForm,
  postJson,
} from "./test-fixtures.ts";

const PAYLOAD = {
  algorithm: "HMAC-SHA256",
  issued_at: 1761130000,
  user_id: "1234567890",
};

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): logs a valid form-encoded request and answers with url + code",
  async () => {
    const store = fakeStore();
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD)),
      deps({ store }),
    );
    assertStrictEquals(res.status, 200);
    const body = (await res.json()) as {
      url: string;
      confirmation_code: string;
    };
    assertMatch(body.confirmation_code, /^[0-9a-f]{16}$/);
    assertStrictEquals(
      body.url,
      `${STATUS_PAGE}?code=${body.confirmation_code}`,
    );
    assertStrictEquals(store.inserted.length, 1);
    assertEquals(store.inserted[0], {
      fb_user_id: "1234567890",
      confirmation_code: body.confirmation_code,
      status: "received",
      issued_at: new Date(PAYLOAD.issued_at * 1000).toISOString(),
    });
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): stores a null issued_at when the payload has none or it is invalid",
  async () => {
    const store = fakeStore();
    const { issued_at: _omit, ...withoutIssuedAt } = PAYLOAD;
    await handleMetaDataDeletion(
      postForm(await sign(withoutIssuedAt)),
      deps({ store }),
    );
    for (const issued_at of ["soon", 1e15, -5, true]) {
      await handleMetaDataDeletion(
        postForm(await sign({ ...PAYLOAD, issued_at })),
        deps({ store }),
      );
    }
    assertStrictEquals(store.inserted.length, 5);
    for (const row of store.inserted) assertStrictEquals(row.issued_at, null);
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): accepts a numeric user_id and ignores a non-scalar one",
  async () => {
    const store = fakeStore();
    await handleMetaDataDeletion(
      postForm(await sign({ ...PAYLOAD, user_id: 1234567890 })),
      deps({ store }),
    );
    await handleMetaDataDeletion(
      postForm(await sign({ ...PAYLOAD, user_id: { id: "x" } })),
      deps({ store }),
    );
    assertStrictEquals(store.inserted[0]?.fb_user_id, "1234567890");
    assertStrictEquals(store.inserted[1]?.fb_user_id, null);
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): accepts a JSON body too",
  async () => {
    const res = await handleMetaDataDeletion(
      postJson({ signed_request: await sign(PAYLOAD) }),
      deps(),
    );
    assertStrictEquals(res.status, 200);
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): stores a null fb_user_id when the payload has none",
  async () => {
    const store = fakeStore();
    const { user_id: _omit, ...withoutUser } = PAYLOAD;
    await handleMetaDataDeletion(
      postForm(await sign(withoutUser)),
      deps({ store }),
    );
    assertStrictEquals(store.inserted[0]?.fb_user_id, null);
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): rejects a request signed with another secret",
  async () => {
    const store = fakeStore();
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD, "other-secret")),
      deps({ store }),
    );
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), { error: "Invalid signed_request" });
    assertStrictEquals(store.inserted.length, 0);
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): rejects a body without signed_request",
  async () => {
    const res = await handleMetaDataDeletion(postJson({}), deps());
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), { error: "Invalid signed_request" });
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): returns 500 Not configured without an app secret",
  async () => {
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD)),
      deps({ appSecret: undefined }),
    );
    assertStrictEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Not configured" });
  },
);

Deno.test(
  "handleMetaDataDeletion: Meta callback (POST): returns a fixed 500 when the insert fails",
  async () => {
    const store = fakeStore({
      async insert() {
        throw new Error("duplicate key");
      },
    });
    const res = await handleMetaDataDeletion(
      postForm(await sign(PAYLOAD)),
      deps({ store }),
    );
    assertStrictEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Internal error" });
  },
);
