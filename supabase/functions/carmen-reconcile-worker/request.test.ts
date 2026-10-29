import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { parseWorkerRequest, rejectInvalidRequest } from "./request.ts";

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
