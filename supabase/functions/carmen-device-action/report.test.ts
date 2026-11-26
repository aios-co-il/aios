import { assertEquals } from "jsr:@std/assert@1";
import { DEVICE_ACTION_STATUS } from "../_shared/carmen/device/contract.ts";
import { PANEL_STATUSES, parseReport } from "./report.ts";

const PAGE = { origin: "https://example.com", path: "/a" };

Deno.test("parseReport", async (t) => {
  await t.step("a panel reports every status but the server's three", () => {
    const serverOnly = DEVICE_ACTION_STATUS.filter(
      (status) => !PANEL_STATUSES.some((reported) => reported === status),
    );

    assertEquals(serverOnly, ["pending", "claimed", "outcome_unknown"]);
  });

  await t.step("a done step needs a card rule that lets it run", () => {
    const done = { status: "done", observed: PAGE, result: PAGE };

    assertEquals(parseReport({ ...done, decision: "ask" })?.decision, "ask");
    assertEquals(parseReport({ ...done, decision: "free" })?.decision, "free");
    assertEquals(parseReport({ ...done, decision: "never" }), null);
    assertEquals(parseReport(done), null);
  });

  await t.step("a done step needs where it ran and what it got", () => {
    const done = { status: "done", decision: "free" };

    assertEquals(parseReport({ ...done, result: PAGE }), null);
    assertEquals(parseReport({ ...done, observed: PAGE }), null);
  });

  await t.step("a user declines only a card", () => {
    assertEquals(parseReport({ status: "denied", decision: "free" }), null);
    assertEquals(parseReport({ status: "denied", decision: "ask" }), {
      status: "denied",
      decision: "ask",
      observed: null,
      result: null,
      trust_origin: null,
    });
  });

  await t.step("a refused step asked nobody", () => {
    assertEquals(
      parseReport({ status: "refused", decision: "never" })?.decision,
      "never",
    );
    for (const decision of ["ask", "free", undefined]) {
      assertEquals(parseReport({ status: "refused", decision }), null);
    }
  });

  await t.step("a step that did not run carries no result", () => {
    for (const status of PANEL_STATUSES.filter((known) => known !== "done")) {
      const report = { status, decision: "ask", result: PAGE };

      assertEquals(parseReport(report), null);
    }
  });

  await t.step("an unknown rule or a malformed address is refused", () => {
    const changed = { status: "target_changed" };

    assertEquals(parseReport({ ...changed, decision: "trusted" }), null);
    assertEquals(parseReport({ ...changed, observed: "example.com" }), null);
    assertEquals(parseReport({ ...changed, observed: PAGE })?.observed, PAGE);
    assertEquals(parseReport({ ...changed, decision: "ask" })?.decision, "ask");
  });

  await t.step("a trust comes only from a card the user tapped", () => {
    const tapped = {
      status: "done",
      decision: "ask",
      observed: PAGE,
      result: PAGE,
    };

    assertEquals(
      parseReport({ ...tapped, trust_origin: PAGE.origin })?.trust_origin,
      PAGE.origin,
    );
    assertEquals(parseReport(tapped)?.trust_origin, null);
    // A step that ran without a card, or did not run, trusts nothing.
    assertEquals(
      parseReport({ ...tapped, decision: "free", trust_origin: PAGE.origin }),
      null,
    );
    assertEquals(
      parseReport({
        status: "denied",
        decision: "ask",
        observed: PAGE,
        trust_origin: PAGE.origin,
      }),
      null,
    );
  });

  await t.step("a trust names exactly the https origin the tab is on", () => {
    const tapped = { status: "done", decision: "ask", result: PAGE };
    const plain = { origin: "http://example.com", path: "/a" };

    for (const trust_origin of [
      "https://other.example",
      "https://example.com/",
      "https://example.com:8443",
      "HTTPS://EXAMPLE.COM",
      42,
    ]) {
      assertEquals(
        parseReport({ ...tapped, observed: PAGE, trust_origin }),
        null,
      );
    }
    assertEquals(
      parseReport({ ...tapped, observed: plain, trust_origin: plain.origin }),
      null,
    );
  });
});
