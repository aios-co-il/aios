import { expect, test } from "vitest";
import {
  agenciesFromJoin,
  mergeAgencyLists,
  pickTenantHomeAgencyId,
} from "./resolveTenantAgency.ts";

const TENANT = "tenant-promo";
const OWNED_DEFAULT = {
  id: "agency-owned-default",
  tenant_id: TENANT,
  is_default: true,
  created_at: "2026-01-02T00:00:00.000Z",
};
const OWNED_FIRST = {
  id: "agency-owned-first",
  tenant_id: TENANT,
  is_default: false,
  created_at: "2026-01-01T00:00:00.000Z",
};
const SHARED = {
  id: "agency-shared-promo",
  tenant_id: "tenant-home",
  is_default: false,
  created_at: "2025-01-01T00:00:00.000Z",
};

test("owned default beats other owned agencies", () => {
  expect(
    pickTenantHomeAgencyId(TENANT, [OWNED_FIRST, OWNED_DEFAULT, SHARED]),
  ).toBe(OWNED_DEFAULT.id);
});

test("first owned agency is used when none is default", () => {
  expect(pickTenantHomeAgencyId(TENANT, [OWNED_FIRST, SHARED])).toBe(
    OWNED_FIRST.id,
  );
});

test("shared agency is used when the tenant owns none", () => {
  expect(pickTenantHomeAgencyId(TENANT, [SHARED])).toBe(SHARED.id);
});

test("returns null without a tenant or agency list", () => {
  expect(pickTenantHomeAgencyId(null, [SHARED])).toBe(null);
  expect(pickTenantHomeAgencyId(TENANT, [])).toBe(null);
  expect(pickTenantHomeAgencyId(TENANT, undefined)).toBe(null);
});

test("mergeAgencyLists de-duplicates owned and shared rows", () => {
  const merged = mergeAgencyLists([OWNED_FIRST, SHARED], [SHARED]);
  expect(merged.map((row) => row.id)).toStrictEqual([
    OWNED_FIRST.id,
    SHARED.id,
  ]);
});

test("agenciesFromJoin accepts a nested object or array", () => {
  expect(agenciesFromJoin(SHARED).map((row) => row.id)).toStrictEqual([
    SHARED.id,
  ]);
  expect(agenciesFromJoin([SHARED, null]).map((row) => row.id)).toStrictEqual([
    SHARED.id,
  ]);
  expect(agenciesFromJoin(null)).toStrictEqual([]);
});
