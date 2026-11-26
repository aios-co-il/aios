import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { fetchMetaDiscovery } from "./meta-discovery-request.ts";
import { metaLeadPages } from "./meta-lead-pages.ts";
import { metaLeadFormsForPage } from "./meta-lead-forms.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "Meta page and form discovery keep authentication in headers on every page",
  async () => {
    const requests: Array<Request> = [];
    const responses = [
      {
        data: [{ id: "page1", name: "One", access_token: "page-token" }],
        paging: {
          next: "https://graph.facebook.com/next-accounts?after=cursor&access_token=leaked&appsecret_proof=proof",
        },
      },
      { data: [{ id: "page2", name: "Two", access_token: "page-token-2" }] },
      {
        data: [{ id: "form1", name: "Form one" }],
        paging: {
          next: "https://graph.facebook.com/next-forms?after=cursor&access_token=leaked",
        },
      },
      { data: [{ id: "form2", name: "Form two" }] },
    ];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(JSON.stringify(responses.shift()), {
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const fixture = executorClient([
        [
          {
            id: "integration",
            api_key: "account-token",
            settings: {},
            shared_from_integration_id: null,
          },
        ],
      ]);
      const pages = await metaLeadPages(fixture.context.supabase, "tenant");
      assertEquals(
        pages.map((page) => page.id),
        ["page1", "page2"],
      );
      const forms = await metaLeadFormsForPage(pages[0]);
      assertEquals(
        forms.map((form) => form.id),
        ["form1", "form2"],
      );
      assertEquals(requests.length, 4);
      for (const [i, request] of requests.entries()) {
        const url = new URL(request.url);
        assertEquals(url.searchParams.has("access_token"), false);
        assertEquals(url.searchParams.has("appsecret_proof"), false);
        assertEquals(
          request.headers.get("Authorization"),
          `Bearer ${i < 2 ? "account-token" : "page-token"}`,
        );
      }
      assertEquals(
        new URL(requests[1].url).searchParams.get("after"),
        "cursor",
      );
      assertThrows(
        () =>
          fetchMetaDiscovery(
            "https://untrusted.example/next?access_token=leaked",
            "account-token",
          ),
        Error,
        "Invalid Meta discovery URL",
      );
      assertEquals(requests.length, 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);
