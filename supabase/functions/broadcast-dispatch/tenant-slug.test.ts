import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { fakeDb } from "../_shared/broadcast/fake-db.ts";
import { tenantSlugOf } from "./tenant-slug.ts";

describe("tenantSlugOf", () => {
  it("returns the broadcast tenant's slug", async () => {
    const { db } = fakeDb({
      tenants: [
        { id: "t1", slug: "pdpsagot" },
        { id: "t2", slug: "other" },
      ],
    });
    assertEquals(await tenantSlugOf(db, "t1"), "pdpsagot");
  });

  it("refuses to build links without a slug", async () => {
    const { db } = fakeDb({ tenants: [{ id: "t1", slug: null }] });
    await assertRejects(() => tenantSlugOf(db, "t1"), Error, "has no slug");
  });
});
