import { assertEquals } from "jsr:@std/assert@1";
import {
  customDomainProblem,
  domainFingerprint,
  normalizeDomain,
  siteWithDomain,
} from "./site-domain.ts";

Deno.test("customDomainProblem", async (t) => {
  await t.step("an empty value clears the domain and is no problem", () => {
    assertEquals(customDomainProblem("  "), null);
  });

  await t.step("subdomains, apexes and punycode are accepted", () => {
    for (const domain of [
      "lp.exsitu.co.il",
      "exsitu.co.il",
      " LP.Example.com ",
      "a.xn--4dbrk0ce",
    ]) {
      assertEquals(customDomainProblem(domain), null, domain);
    }
  });

  await t.step("schemes, paths, ports and single labels are refused", () => {
    for (const domain of [
      "https://lp.exsitu.co.il",
      "lp.exsitu.co.il/offer",
      "lp.exsitu.co.il:443",
      "localhost",
      "-lp.exsitu.co.il",
      "lp..exsitu.co.il",
      "lp_x.exsitu.co.il",
      "lp.exsitu.co.il.",
      `${"a".repeat(64)}.example.com`,
    ]) {
      assertEquals(
        customDomainProblem(domain)?.startsWith("הדומיין לא תקין"),
        true,
        domain,
      );
    }
  });

  await t.step("aios.co.il hostnames are refused with their own reason", () => {
    for (const domain of ["aios.co.il", "exsitu.aios.co.il"]) {
      assertEquals(
        customDomainProblem(domain)?.includes("aios.co.il"),
        true,
        domain,
      );
    }
  });
});

Deno.test("siteWithDomain", async (t) => {
  const site = { name: "Acme", tenantId: "t-1", clientId: "c-1" };

  await t.step("a new domain is added after the other keys", () => {
    assertEquals(siteWithDomain(site, "LP.acme.co.il"), {
      ...site,
      domains: ["lp.acme.co.il"],
    });
  });

  await t.step("the domain the repository holds changes nothing", () => {
    assertEquals(
      siteWithDomain({ ...site, domains: ["lp.acme.co.il"] }, "lp.acme.co.il"),
      null,
    );
    assertEquals(siteWithDomain(site, null), null);
  });

  await t.step("a changed domain replaces the key in its place", () => {
    const updated = siteWithDomain(
      { name: "Acme", domains: ["old.acme.co.il"], tenantId: "t-1" },
      "new.acme.co.il",
    );
    assertEquals(Object.keys(updated ?? {}), ["name", "domains", "tenantId"]);
    assertEquals(updated?.domains, ["new.acme.co.il"]);
  });

  await t.step("no domain drops the key", () => {
    assertEquals(
      siteWithDomain({ ...site, domains: ["lp.acme.co.il"] }, null),
      site,
    );
  });
});

Deno.test("normalizeDomain and domainFingerprint", () => {
  assertEquals(normalizeDomain(" LP.Acme.CO.IL "), "lp.acme.co.il");
  assertEquals(domainFingerprint(null), "");
  assertEquals(domainFingerprint("LP.acme.co.il"), "domains:lp.acme.co.il");
});
