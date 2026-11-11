import { describe, expect, it } from "vitest";
import { parseUserTenants, tenantsOfResponse } from "./userTenantsPayload";

describe("tenantsOfResponse", () => {
  it("reads the tenants field of an object payload", () => {
    expect(tenantsOfResponse({ tenants: [{ id: "t1" }] })).toEqual([
      { id: "t1" },
    ]);
  });

  it("returns undefined for payloads without tenants", () => {
    expect(tenantsOfResponse(null)).toBeUndefined();
    expect(tenantsOfResponse("x")).toBeUndefined();
    expect(tenantsOfResponse({ error: "x" })).toBeUndefined();
  });
});

describe("parseUserTenants", () => {
  it("keeps tenants with an id and name, extra fields included", () => {
    const tenant = {
      id: "t1",
      name: "Acme",
      org_type: "agency",
      slug: null,
      plan: "pro",
    };
    expect(parseUserTenants([tenant])).toEqual([tenant]);
  });

  it("tolerates a missing org_type and mistyped optional fields", () => {
    const [tenant] = parseUserTenants([{ id: "t2", name: "Beta", status: 3 }]);
    expect(tenant.org_type).toBe("");
    expect(tenant.status).toBeUndefined();
  });

  it("drops entries without a non-empty string id or name", () => {
    expect(
      parseUserTenants([
        null,
        "t0",
        { id: "", name: "A" },
        { id: "t3" },
        { id: 4, name: "B" },
        { id: "t5", name: "C" },
      ]).map((t) => t.id),
    ).toEqual(["t5"]);
  });
});
