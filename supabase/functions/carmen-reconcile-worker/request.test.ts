import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { fakeJwt } from "../_shared/auth/jwt-test-fixtures.ts";
import {
  isServiceRequest,
  parseWorkerRequest,
  rejectInvalidRequest,
} from "./request.ts";

describe("isServiceRequest", () => {
  const req = (auth: string) =>
    new Request("http://x", {
      method: "POST",
      headers: { Authorization: auth },
    });

  it("accepts the env key and the cron's Vault service-role JWT (AIO-503)", () => {
    const vaultJwt = fakeJwt({ role: "service_role", iss: "supabase" });
    assertStrictEquals(
      isServiceRequest(req("Bearer env-key"), "env-key"),
      true,
    );
    assertStrictEquals(
      isServiceRequest(req(`Bearer ${vaultJwt}`), "env-key"),
      true,
    );
  });

  it("refuses a user JWT or another key", () => {
    const userJwt = fakeJwt({ role: "authenticated", sub: "u1" });
    assertStrictEquals(
      isServiceRequest(req(`Bearer ${userJwt}`), "env-key"),
      false,
    );
    assertStrictEquals(isServiceRequest(req("Bearer other"), "env-key"), false);
  });
});

describe("parseWorkerRequest", () => {
  it("defaults an empty body to the nightly tables walk", () => {
    const request = parseWorkerRequest(null);
    assertEquals(
      [
        request.phase,
        request.cursor,
        request.hop,
        request.maxTables,
        request.apiCallBudget,
        request.scoped,
        request.chain,
      ],
      ["tables", null, 0, 6, 60, false, true],
    );
  });

  it("clamps numbers and keeps only string ids", () => {
    const request = parseWorkerRequest({
      phase: "retry",
      max_tables: 99,
      api_call_budget: 1,
      hop: "x",
      deferred: ["a", 2, "b"],
      table_ids: [1],
    });
    assertEquals(
      [request.phase, request.maxTables, request.apiCallBudget, request.hop],
      ["retry", 25, 5, 0],
    );
    assertEquals(request.deferred, ["a", "b"]);
    assertEquals(request.tableIds, []);
    assertStrictEquals(request.scoped, false);
  });
});

describe("rejectInvalidRequest", () => {
  it("keeps fixtures out of production and off the nightly chain", () => {
    const fixture = parseWorkerRequest({
      source: "fixture",
      table_ids: ["t1"],
    });
    assertStrictEquals(
      rejectInvalidRequest(fixture, "production"),
      "fixture source is not allowed in production",
    );
    assertStrictEquals(rejectInvalidRequest(fixture, "staging"), null);
    assertStrictEquals(
      rejectInvalidRequest(
        parseWorkerRequest({ source: "fixture" }),
        "staging",
      ),
      "fixture source needs table_ids",
    );
    assertStrictEquals(
      rejectInvalidRequest(
        parseWorkerRequest({ client_id: "c1", phase: "accounts" }),
        "staging",
      ),
      "retry and accounts phases are only for the nightly chain",
    );
  });
});
