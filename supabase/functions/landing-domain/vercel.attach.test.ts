import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { VercelApiError } from "./vercel.ts";
import { CONFIG_PATH, DOMAIN_PATH, fakeVercel } from "./vercel.test-fixture.ts";

const ADD_PATH = "POST /v10/projects/prj_1/domains";
const VERIFY_PATH = `POST ${DOMAIN_PATH}/verify`;
const PENDING = {
  name: "lp.exsitu.co.il",
  apexName: "exsitu.co.il",
  verified: false,
  verification: [
    {
      type: "TXT",
      domain: "_vercel.exsitu.co.il",
      value: "vc-domain-verify=abc",
    },
  ],
};

Deno.test(
  "addDomain: a 400 for a domain this project has counts as added",
  async () => {
    const { vercel } = fakeVercel({
      [ADD_PATH]: [400, { error: { code: "domain_already_exists" } }],
      [`GET ${DOMAIN_PATH}`]: [200, { name: "lp.exsitu.co.il" }],
    });
    await vercel.addDomain("lp.exsitu.co.il");
  },
);

Deno.test(
  "addDomain: a 400 for a domain the project lacks stays an error",
  async () => {
    const { vercel } = fakeVercel({
      [ADD_PATH]: [400, { error: { code: "domain_already_exists" } }],
      [`GET ${DOMAIN_PATH}`]: [404, { error: { code: "not_found" } }],
    });
    const error = await assertRejects(
      () => vercel.addDomain("lp.exsitu.co.il"),
      VercelApiError,
    );
    assertEquals(error.status, 400);
  },
);

Deno.test("checkDomain asks Vercel to verify a pending domain", async (t) => {
  await t.step("a met challenge comes back verified", async () => {
    const { vercel, calls } = fakeVercel({
      [`GET ${DOMAIN_PATH}`]: [200, PENDING],
      [VERIFY_PATH]: [200, { ...PENDING, verified: true, verification: [] }],
      [`GET ${CONFIG_PATH}`]: [200, { misconfigured: false }],
    });
    assertEquals(await vercel.checkDomain("lp.exsitu.co.il"), {
      connected: true,
      verified: true,
      records: [],
    });
    assertEquals(
      calls.some((call) => call.url.pathname.endsWith("/verify")),
      true,
    );
  });

  await t.step(
    "an unmet challenge (400) keeps the TXT record to add",
    async () => {
      const { vercel } = fakeVercel({
        [`GET ${DOMAIN_PATH}`]: [200, PENDING],
        [VERIFY_PATH]: [400, { error: { code: "missing_txt_record" } }],
        [`GET ${CONFIG_PATH}`]: [200, { misconfigured: false }],
      });
      const check = await vercel.checkDomain("lp.exsitu.co.il");
      assertEquals(check.verified, false);
      assertEquals(check.records[1], {
        type: "TXT",
        name: "_vercel",
        value: "vc-domain-verify=abc",
      });
    },
  );

  await t.step("any other answer is an error", async () => {
    const { vercel } = fakeVercel({
      [`GET ${DOMAIN_PATH}`]: [200, PENDING],
      [VERIFY_PATH]: [403, { error: { code: "forbidden" } }],
    });
    await assertRejects(
      () => vercel.checkDomain("lp.exsitu.co.il"),
      VercelApiError,
    );
  });

  await t.step("a verified domain is not verified again", async () => {
    const { vercel, calls } = fakeVercel({
      [`GET ${DOMAIN_PATH}`]: [200, { ...PENDING, verified: true }],
      [`GET ${CONFIG_PATH}`]: [200, { misconfigured: false }],
    });
    await vercel.checkDomain("lp.exsitu.co.il");
    assertEquals(
      calls.some((call) => call.method === "POST"),
      false,
    );
  });
});
