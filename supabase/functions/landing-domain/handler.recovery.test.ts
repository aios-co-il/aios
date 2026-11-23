import { assertEquals } from "jsr:@std/assert@1";
import { handleLandingDomain } from "./handler.ts";
import { ITEM, setup } from "./handler.test-fixture.ts";
import { DomainInUseError, VercelApiError } from "./vercel.ts";

const CONNECT = { action: "connect", item_id: ITEM };

Deno.test("a domain on another Vercel project is refused", async () => {
  const { deps } = setup(
    { customDomain: "lp.exsitu.co.il" },
    { addError: new DomainInUseError("lp.exsitu.co.il") },
  );
  assertEquals((await handleLandingDomain(CONNECT, deps)).status, 409);
});

Deno.test(
  "a failed attach stays recorded, so clearing the domain detaches it",
  async () => {
    const { deps, row, vercelCalls } = setup(
      { customDomain: "lp.exsitu.co.il" },
      {
        addError: new VercelApiError(
          500,
          "internal",
          "/v10/projects/p/domains",
        ),
      },
    );
    assertEquals((await handleLandingDomain(CONNECT, deps)).status, 502);
    // Recorded before the attach: Vercel may hold the domain although the answer failed.
    assertEquals(row.vercelDomain, "lp.exsitu.co.il");
    row.customDomain = null;
    await handleLandingDomain(CONNECT, deps);
    assertEquals(vercelCalls, [
      "add lp.exsitu.co.il",
      "remove lp.exsitu.co.il",
    ]);
    assertEquals(row.vercelDomain, null);
  },
);

Deno.test(
  "an older connect never attaches a domain saved over since",
  async () => {
    const { deps, row, vercelCalls } = setup(
      { customDomain: "old.exsitu.co.il" },
      { savedMeanwhile: "new.exsitu.co.il" },
    );
    await handleLandingDomain(CONNECT, deps);
    assertEquals(vercelCalls.includes("add old.exsitu.co.il"), false);
    assertEquals(row.vercelDomain, null);
  },
);
