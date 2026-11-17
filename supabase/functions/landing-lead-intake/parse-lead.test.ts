import { assertEquals } from "jsr:@std/assert";
import { parseLandingLead } from "./parse-lead.ts";

const valid = {
  subdomain: "acme",
  slug: "home",
  name: " Dana Levi ",
  phone: "050-1234567",
};

Deno.test("parseLandingLead", async (t) => {
  await t.step("accepts a name and phone and trims them", () => {
    assertEquals(parseLandingLead(valid), {
      subdomain: "acme",
      slug: "home",
      name: "Dana Levi",
      phone: "050-1234567",
      email: null,
    });
  });

  await t.step("keeps a valid email", () => {
    assertEquals(
      parseLandingLead({ ...valid, email: "dana@example.com" })?.email,
      "dana@example.com",
    );
  });

  await t.step("rejects a malformed body, site, slug, phone or email", () => {
    assertEquals(parseLandingLead(null), null);
    assertEquals(parseLandingLead([valid]), null);
    assertEquals(parseLandingLead({ ...valid, subdomain: "Acme.evil" }), null);
    assertEquals(parseLandingLead({ ...valid, slug: "../x" }), null);
    assertEquals(parseLandingLead({ ...valid, name: "D" }), null);
    assertEquals(parseLandingLead({ ...valid, phone: "call me" }), null);
    assertEquals(parseLandingLead({ ...valid, email: "not-an-email" }), null);
  });
});
