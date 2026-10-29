import { assertStrictEquals } from "jsr:@std/assert@1";
import { parseRequest } from "./handler.ts";

const SECRET = "test-app-secret";
const FUNCTION_URL = "https://example.test/functions/v1/meta-data-deletion";

function post(contentType: string, body: string) {
  return new Request(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

Deno.test(
  "parseRequest: returns null for an unparseable form body",
  async () => {
    assertStrictEquals(
      await parseRequest(post("text/plain", "not a form"), SECRET),
      null,
    );
  },
);

Deno.test("parseRequest: returns null for malformed JSON", async () => {
  assertStrictEquals(
    await parseRequest(post("application/json", "{"), SECRET),
    null,
  );
});

Deno.test(
  "parseRequest: returns null when signed_request is not a string",
  async () => {
    const body = JSON.stringify({ signed_request: 42 });
    assertStrictEquals(
      await parseRequest(post("application/json", body), SECRET),
      null,
    );
  },
);
