import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  type EnvironmentName,
  environmentOrigins,
  NO_ORIGINS,
} from "./never-controllable.test-fixture.ts";
import {
  isHostWithinAny,
  isNeverControllable,
  neverControllableReason,
} from "./never-controllable.ts";

const ENVIRONMENTS: Array<EnvironmentName> = ["production", "staging"];

/** A custom API domain no pattern covers, as an environment could configure one. */
const CUSTOM = {
  appOrigins: ["https://crm.example.test:8443"],
  backendOrigins: ["https://db.example.test"],
};

Deno.test("never controllable: each environment's own addresses", async (t) => {
  for (const name of ENVIRONMENTS) {
    const origins = await environmentOrigins(name);

    await t.step(`${name}: the app and its backend`, () => {
      const [app] = origins.appOrigins;
      const [backend] = origins.backendOrigins;

      assertStrictEquals(
        neverControllableReason(`${app}/command-center`, origins),
        "aios_app",
      );
      assertStrictEquals(
        neverControllableReason(
          `${backend}/functions/v1/run-ai-agent`,
          origins,
        ),
        "aios_backend",
      );
    });

    await t.step(`${name}: an ordinary site stays reachable`, () => {
      assertStrictEquals(
        neverControllableReason("https://example.com/pricing", origins),
        null,
      );
    });
  }

  await t.step(
    "the configured app addresses are the documented ones",
    async () => {
      assertEquals(
        await Promise.all(ENVIRONMENTS.map(environmentOrigins)).then((all) =>
          all.flatMap((origins) => origins.appOrigins),
        ),
        ["https://aios.co.il", "https://staging.aios.co.il"],
      );
    },
  );
});

Deno.test(
  "never controllable: AIOS in every environment, with no configuration",
  async (t) => {
    const cases: Array<[string, string]> = [
      ["https://aios.co.il/", "aios_app"],
      ["https://www.aios.co.il/login", "aios_app"],
      ["https://staging.aios.co.il/clients", "aios_app"],
      ["https://after-lead-git-develop-aios-crm.vercel.app/", "aios_app"],
      [
        "https://after-lead-git-feat-aio-666-x-aios-crm.vercel.app/",
        "aios_app",
      ],
      ["https://after-lead-aios-crm.vercel.app/", "aios_app"],
      ["https://api.aios.co.il/rest/v1/clients", "aios_backend"],
      ["https://api-staging.aios.co.il/auth/v1/user", "aios_backend"],
      ["https://zvoijyneresvkadpprel.supabase.co/rest/v1/", "aios_backend"],
      ["https://efwzhyfpkocghdhhhaza.supabase.co/auth/v1/", "aios_backend"],
      ["https://supabase.com/dashboard/project/x", "operations_console"],
      ["https://app.supabase.com/", "operations_console"],
      ["https://vercel.com/aios-crm/after-lead", "operations_console"],
      ["https://accounts.google.com/o/oauth2/v2/auth", "sign_in"],
      ["https://chromewebstore.google.com/detail/x", "extension_store"],
      ["https://chrome.google.com/webstore/detail/x", "extension_store"],
    ];

    for (const [url, reason] of cases) {
      await t.step(url, () => {
        assertStrictEquals(neverControllableReason(url, NO_ORIGINS), reason);
      });
    }

    await t.step("a configured address outside every pattern", () => {
      assertStrictEquals(
        neverControllableReason("https://crm.example.test/x", CUSTOM),
        "aios_app",
      );
      assertStrictEquals(
        neverControllableReason("http://crm.example.test/x", CUSTOM),
        "aios_app",
      );
      assertStrictEquals(
        neverControllableReason("https://db.example.test/rest/v1/", CUSTOM),
        "aios_backend",
      );
      assertStrictEquals(
        neverControllableReason("https://db.example.test/", NO_ORIGINS),
        null,
      );
    });

    await t.step(
      "a configured value that is not an address names no host",
      () => {
        const origins = {
          appOrigins: ["", "nonsense"],
          backendOrigins: ["//"],
        };

        assertStrictEquals(
          isNeverControllable("https://example.com/", origins),
          false,
        );
      },
    );
  },
);

Deno.test("never controllable: anything that is not a web page", async (t) => {
  for (const url of [
    "",
    "nonsense",
    "example.com",
    "//example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>1</script>",
    "blob:https://example.com/0f8e7f2c-0000-4000-8000-000000000000",
    "about:blank",
    "chrome://settings/passwords",
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop/sidepanel.html",
    "view-source:https://example.com/",
    "ftp://example.com/",
    "ws://example.com/",
    "mailto:someone@example.com",
  ]) {
    await t.step(url || "(empty)", () => {
      assertStrictEquals(
        neverControllableReason(url, NO_ORIGINS),
        "not_a_web_page",
      );
    });
  }
});

Deno.test("never controllable: hostile spellings of an address", async (t) => {
  const cases: Array<[string, string, string | null]> = [
    ["upper case", "HTTPS://STAGING.AIOS.CO.IL/Clients", "aios_app"],
    ["a port", "https://aios.co.il:8443/", "aios_app"],
    ["plain http", "http://aios.co.il/", "aios_app"],
    ["a trailing dot", "https://aios.co.il./", "aios_app"],
    ["several trailing dots", "https://accounts.google.com../", "sign_in"],
    [
      "a backend with a trailing dot",
      "https://x.supabase.co./",
      "aios_backend",
    ],
    ["tabs and newlines inside", "https://aios\t.co\n.il/", "aios_app"],
    ["backslashes", "https:\\\\aios.co.il\\x", "aios_app"],
    [
      "the real site after userinfo",
      "https://example.com@aios.co.il/",
      "credentials_in_address",
    ],
    [
      "userinfo naming the app",
      "https://aios.co.il@evil.example/",
      "credentials_in_address",
    ],
    [
      "userinfo with a password",
      "https://user:pass@example.com/",
      "credentials_in_address",
    ],
    ["the app as a path", "https://evil.example/aios.co.il", null],
    [
      "the app as a query",
      "https://evil.example/?next=https://aios.co.il",
      null,
    ],
    ["the app as a subdomain label", "https://aios.co.il.evil.example/", null],
    ["a name that ends like the app", "https://notaios.co.il/", null],
    ["a name that ends like the console", "https://notsupabase.com/", null],
    [
      "a console name inside another host",
      "https://vercel.com.evil.example/",
      null,
    ],
    ["a look-alike in Cyrillic", "https://аios.co.il/", null],
    ["the same look-alike in punycode", "https://xn--ios-5cd.co.il/", null],
    ["an internationalised name", "https://בנק.example/", null],
    ["a full-width spelling of the app", "https://ａios.co.il/", "aios_app"],
    ["an IPv4 literal", "http://192.168.1.1/admin", null],
    ["an IPv4 literal as one number", "http://2130706433/", null],
    ["an IPv6 literal", "http://[::1]:8080/", null],
    ["localhost", "http://localhost:8080/", null],
  ];

  for (const [label, url, reason] of cases) {
    await t.step(label, () => {
      assertStrictEquals(neverControllableReason(url, NO_ORIGINS), reason);
    });
  }

  await t.step("a local address only when it is this environment's app", () => {
    const local = {
      appOrigins: ["http://localhost:8080"],
      backendOrigins: ["http://127.0.0.1:54321"],
    };

    assertStrictEquals(
      neverControllableReason("http://localhost:5173/", local),
      "aios_app",
    );
    assertStrictEquals(
      neverControllableReason("http://2130706433:54321/rest/v1/", local),
      "aios_backend",
    );
    assertStrictEquals(
      neverControllableReason("http://192.168.1.1/", local),
      null,
    );
  });
});

Deno.test("isHostWithinAny matches whole labels only", () => {
  const domains = ["example.com", "bank"];

  for (const [hostname, expected] of [
    ["example.com", true],
    ["a.b.example.com", true],
    ["notexample.com", false],
    ["example.com.evil.test", false],
    ["example.co", false],
    ["first.bank", true],
    ["firstbank", false],
    ["", false],
  ] as const) {
    assertStrictEquals(isHostWithinAny(hostname, domains), expected, hostname);
  }
});
