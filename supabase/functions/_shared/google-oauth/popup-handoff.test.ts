import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { withRuntime } from "../testing/served-handler.ts";
import { redirectHandoffError } from "./handoff-response.ts";
import { oauthStateKey, signOAuthState } from "./oauth-state.ts";
import { popupCallbackResponse } from "./popup-handoff.ts";

const CALLBACK = "https://api.aios.co.il/functions/v1/gmail-auth";

const env = { GOOGLE_CLIENT_SECRET: "test-secret", APP_URL: null };

/** A state the callback accepts, started on Staging. */
function stagingState(): Promise<string> {
  return signOAuthState(
    {
      userId: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      origin: "https://staging.aios.co.il",
      addNew: false,
    },
    oauthStateKey("test-secret"),
  );
}

/** The callback's page for this query, under the test environment. */
function callbackPage(query: string): Promise<string> {
  return withRuntime({ env, fetch: globalThis.fetch }, async () => {
    const response = await popupCallbackResponse(
      "gmail-auth",
      new URL(`${CALLBACK}?${query}`),
      { requireTenant: true },
    );
    assertEquals(response.status, 200);
    return await response.text();
  });
}

Deno.test(
  "the popup hands the code to the app origin that started it",
  async () => {
    const state = await stagingState();
    const page = await callbackPage(
      `code=the-code&state=${encodeURIComponent(state)}`,
    );

    assertStringIncludes(page, '"type":"google_connect_code"');
    assertStringIncludes(page, '"code":"the-code"');
    assertStringIncludes(page, '"https://staging.aios.co.il")');
  },
);

Deno.test(
  "refused consent tells the app that started it, with Google's error",
  async () => {
    const state = await stagingState();
    const page = await callbackPage(
      `error=access_denied&state=${encodeURIComponent(state)}`,
    );

    assertStringIncludes(page, '"type":"google_connect_error"');
    assertStringIncludes(page, '"error":"access_denied"');
    assertStringIncludes(page, '"https://staging.aios.co.il")');
  },
);

Deno.test("an unsigned state hands over no code", async () => {
  const page = await callbackPage("code=the-code&state=forged");

  assertStringIncludes(page, '"type":"google_connect_error"');
  assertStringIncludes(page, '"error":"invalid_state"');
  assertEquals(page.includes("the-code"), false);
  assertStringIncludes(page, '"https://aios.co.il")');
});

Deno.test(
  "a state that tries to close the script tag stays inside the JSON",
  async () => {
    const page = await callbackPage(
      `code=c&state=${encodeURIComponent("</script><script>alert(1)</script>")}`,
    );

    assertEquals(page.includes("</script><script>"), false);
    // A backslash, then u003c: the escaped "<".
    assertStringIncludes(page, `${String.fromCharCode(92)}u003c/script>`);
  },
);

Deno.test(
  "a full-page error goes in the fragment of the integrations page",
  async () => {
    const response = await withRuntime({ env, fetch: globalThis.fetch }, () =>
      Promise.resolve(
        redirectHandoffError("google-ads-auth", null, null, "invalid_state"),
      ),
    );

    assertEquals(
      response.headers.get("Location"),
      "https://aios.co.il/t/app/integrations#google_connect=google-ads-auth&error=invalid_state",
    );
  },
);

Deno.test(
  "no code and no error is reported as missing_code, not as a refusal",
  async () => {
    const state = await stagingState();
    const page = await callbackPage(`state=${encodeURIComponent(state)}`);

    assertStringIncludes(page, '"error":"missing_code"');
  },
);
