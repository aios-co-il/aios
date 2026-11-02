import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { handleMetaDataDeletion } from "./handler.ts";
import { FUNCTION_URL, STORED, fakeStore, deps, get } from "./test-fixtures.ts";

Deno.test(
  "handleMetaDataDeletion: status lookup (GET): returns the stored row for a known code",
  async () => {
    const res = await handleMetaDataDeletion(
      get("?code=0123456789abcdef"),
      deps(),
    );
    assertStrictEquals(res.status, 200);
    assertEquals(await res.json(), STORED);
  },
);

Deno.test(
  "handleMetaDataDeletion: status lookup (GET): trims the code before looking it up",
  async () => {
    const res = await handleMetaDataDeletion(
      get("?code=%200123456789abcdef%20"),
      deps(),
    );
    assertStrictEquals(res.status, 200);
  },
);

Deno.test(
  "handleMetaDataDeletion: status lookup (GET): returns 400 without a code",
  async () => {
    const res = await handleMetaDataDeletion(get(""), deps());
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), { error: "code is required" });
  },
);

Deno.test(
  "handleMetaDataDeletion: status lookup (GET): returns 404 for an unknown code",
  async () => {
    const res = await handleMetaDataDeletion(
      get("?code=fedcba9876543210"),
      deps(),
    );
    assertStrictEquals(res.status, 404);
    assertEquals(await res.json(), { error: "Unknown confirmation code" });
  },
);

Deno.test(
  "handleMetaDataDeletion: status lookup (GET): returns 404 for a malformed code without querying the store",
  async () => {
    let queried = false;
    const store = fakeStore({
      async findByCode() {
        queried = true;
        return null;
      },
    });
    for (const code of ["nope", "0123456789ABCDEF", "x".repeat(5000)]) {
      const res = await handleMetaDataDeletion(
        get(`?code=${code}`),
        deps({ store }),
      );
      assertStrictEquals(res.status, 404);
    }
    assertStrictEquals(queried, false);
  },
);

Deno.test(
  "handleMetaDataDeletion: status lookup (GET): returns a fixed 500 when the store fails",
  async () => {
    const store = fakeStore({
      async findByCode() {
        throw new Error("connection refused");
      },
    });
    const res = await handleMetaDataDeletion(
      get("?code=0123456789abcdef"),
      deps({ store }),
    );
    assertStrictEquals(res.status, 500);
    // The /data-deletion page maps any non-404 failure to "could not check the
    // status right now"; the DB error text must not leak to the client.
    assertEquals(await res.json(), { error: "Internal error" });
  },
);

Deno.test(
  "handleMetaDataDeletion: other methods: answers OPTIONS with CORS headers and no body",
  async () => {
    const res = await handleMetaDataDeletion(
      new Request(FUNCTION_URL, { method: "OPTIONS" }),
      deps(),
    );
    assertStrictEquals(res.status, 200);
    assertStrictEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
    assertStrictEquals(await res.text(), "");
  },
);

Deno.test(
  "handleMetaDataDeletion: other methods: returns 405 for other methods",
  async () => {
    const res = await handleMetaDataDeletion(
      new Request(FUNCTION_URL, { method: "DELETE" }),
      deps(),
    );
    assertStrictEquals(res.status, 405);
  },
);
