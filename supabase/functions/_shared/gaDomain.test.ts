import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  gaHostsMatch,
  listedPropertyMatchesDomain,
  normalizeGaHost,
} from "./gaDomain.ts";

Deno.test("normalizes a pasted website to a host", () => {
  assertStrictEquals(
    normalizeGaHost("https://www.ggh-law.co.il/about"),
    "ggh-law.co.il",
  );
});

Deno.test("matches a property account name to the domain", () => {
  assertStrictEquals(
    listedPropertyMatchesDomain(
      { name: "Law office", accountName: "ggh-law.co.il" },
      "https://www.ggh-law.co.il/",
    ),
    true,
  );
});

Deno.test("a display name that is not the domain does not match", () => {
  assertStrictEquals(
    listedPropertyMatchesDomain(
      { name: "Periodontics Hebrew Website", accountName: "Dr. Weinberg" },
      "periodontics.co.il",
    ),
    false,
  );
  assertStrictEquals(
    gaHostsMatch("https://www.periodontics.co.il", "periodontics.co.il"),
    true,
  );
});
