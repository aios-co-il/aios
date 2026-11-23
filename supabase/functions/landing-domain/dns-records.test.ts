import { assertEquals } from "jsr:@std/assert@1";
import { recordsFor } from "./dns-records.ts";

Deno.test("recordsFor", async (t) => {
  await t.step(
    "a subdomain without recommendations gets Vercel's CNAME",
    () => {
      assertEquals(recordsFor("lp.exsitu.co.il", {}, {}), [
        { type: "CNAME", name: "lp", value: "cname.vercel-dns.com" },
      ]);
    },
  );

  await t.step("an apex gets an A record, Vercel's or the default", () => {
    assertEquals(recordsFor("exsitu.co.il", {}, {}), [
      { type: "A", name: "@", value: "76.76.21.21" },
    ]);
    assertEquals(
      recordsFor(
        "example.com",
        { apexName: "example.com" },
        { recommendedIPv4: [{ rank: 1, value: ["76.76.21.98"] }] },
      ),
      [{ type: "A", name: "@", value: "76.76.21.98" }],
    );
  });

  await t.step("an ownership challenge adds its TXT record", () => {
    assertEquals(
      recordsFor(
        "lp.exsitu.co.il",
        {
          apexName: "exsitu.co.il",
          verification: [
            {
              type: "TXT",
              domain: "_vercel.exsitu.co.il",
              value: "vc-domain-verify=lp.exsitu.co.il,abc",
            },
          ],
        },
        {},
      ),
      [
        { type: "CNAME", name: "lp", value: "cname.vercel-dns.com" },
        {
          type: "TXT",
          name: "_vercel",
          value: "vc-domain-verify=lp.exsitu.co.il,abc",
        },
      ],
    );
  });
});
