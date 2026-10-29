import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  CALL_SITE_LISTS,
  type CallSiteLists,
  FOLLOW_UPS,
  GUARDED_SENDERS,
  KNOWN_UNSTAMPED_CALLERS,
} from "./call-site-allowlist.ts";
import {
  checkCallSites,
  providerLines,
  readEdgeSources,
  type SourceFile,
} from "./call-sites.ts";
import { OBSERVED_REFUSALS } from "./rules.ts";

const FUNCTIONS_ROOT = new URL("../../", import.meta.url);

Deno.test(
  "every edge sender is guarded, person-only or a known bypass",
  async () => {
    const files = await readEdgeSources(FUNCTIONS_ROOT);
    assertEquals(checkCallSites(files, CALL_SITE_LISTS), {
      unlisted: [],
      guardNotFirst: [],
      folderUnguarded: [],
      staleListed: [],
      unstampedCallers: [],
      staleUnstamped: [],
    });
  },
);

Deno.test("each file is in one list, with its proof or issue", async () => {
  const paths = [
    ...Object.keys(CALL_SITE_LISTS.guarded),
    ...Object.keys(CALL_SITE_LISTS.personOnly),
    ...Object.keys(CALL_SITE_LISTS.bypasses),
  ];
  assertEquals(new Set(paths).size, paths.length);
  for (const check of Object.values(GUARDED_SENDERS)) {
    if (check !== "in_file") {
      const proof = await Deno.stat(new URL(check.proof, FUNCTIONS_ROOT));
      assertEquals(proof.isFile, true, check.proof);
    }
  }
  // Deno CI runs --no-check, so the FollowUpNote type alone does not hold.
  const issues = FOLLOW_UPS.map((issue) => issue.replace(/[()]/g, "\\$&"));
  const note = new RegExp(`^(${issues.join("|")}) \\S`);
  for (const entry of [
    ...Object.values(CALL_SITE_LISTS.bypasses),
    ...Object.values(CALL_SITE_LISTS.unstampedCallers),
  ]) {
    assertMatch(entry, note);
  }
});

Deno.test("unclassified sends are enforced once every caller stamps", () => {
  // The observed rule may only go when its evidence is gone (rules.ts).
  if (Object.keys(KNOWN_UNSTAMPED_CALLERS).length === 0) {
    assertEquals(
      Object.hasOwn(OBSERVED_REFUSALS, "unclassified_service_send"),
      false,
    );
  }
});

/** Empty lists, with these fields filled in. */
const lists = (fields: Partial<CallSiteLists>): CallSiteLists => ({
  guarded: {},
  personOnly: {},
  bypasses: {},
  unstampedCallers: {},
  ...fields,
});

const GREEN_SEND =
  "await fetch(`https://api.green-api.com/waInstance${id}/sendMessage/${token}`);";
const GUARD = "const decision = await authorizeClientSend(db, request);";

const STAMPED_SEND =
  'fetch(`${u}/functions/v1/send-x`, { body: JSON.stringify({ sendKind: "x" }) });';

const UNSTAMPED_SEND =
  "fetch(`${u}/functions/v1/send-x`, { body: JSON.stringify({ to }) });";

/** A source file of these lines. */
const file = (path: string, ...lines: string[]): SourceFile => ({
  path,
  text: lines.join("\n"),
});

Deno.test("checkCallSites", async (t) => {
  await t.step("finds provider calls, not comments about them", () => {
    assertEquals(
      providerLines(["// " + GREEN_SEND, GREEN_SEND].join("\n")),
      [1],
    );
  });

  await t.step("an unlisted sender, and a guard after the send", () => {
    const report = checkCallSites(
      [
        file("loose/index.ts", GREEN_SEND),
        file("late/index.ts", GREEN_SEND, GUARD),
        file("early/index.ts", GUARD, GREEN_SEND),
      ],
      lists({
        guarded: { "late/index.ts": "in_file", "early/index.ts": "in_file" },
      }),
    );
    assertEquals(report.unlisted, ["loose/index.ts"]);
    assertEquals(report.guardNotFirst, ["late/index.ts"]);
  });

  await t.step("the sender step counts as the guard, before the send", () => {
    const STEP = "const refused = await refuseClientSend(serviceClient(), {";
    const report = checkCallSites(
      [
        file("stepped/index.ts", STEP, GREEN_SEND),
        file("removed/index.ts", "const refused = null;", GREEN_SEND),
        file(
          "unwired/index.ts",
          "clientSendRefusalOf(guard, send);",
          GREEN_SEND,
        ),
      ],
      lists({
        guarded: {
          "stepped/index.ts": "in_file",
          "removed/index.ts": "in_file",
          "unwired/index.ts": "in_file",
        },
      }),
    );
    assertEquals(report.guardNotFirst, [
      "removed/index.ts",
      "unwired/index.ts",
    ]);
  });

  await t.step("a split sender whose folder never calls the guard", () => {
    const report = checkCallSites(
      [file("split/gateway.ts", GREEN_SEND), file("split/prepare.ts", "")],
      lists({
        guarded: { "split/gateway.ts": { proof: "split/gateway.test.ts" } },
      }),
    );
    assertEquals(report.folderUnguarded, ["split/gateway.ts"]);
  });

  await t.step("a bypass that no longer sends must be dropped", () => {
    const report = checkCallSites(
      [file("fixed/index.ts", GUARD)],
      lists({
        bypasses: { "fixed/index.ts": "AIO-246 no caller check" },
      }),
    );
    assertEquals(report.staleListed, ["fixed/index.ts"]);
  });

  await t.step("each call of a guarded sender must name a sendKind", () => {
    const report = checkCallSites(
      [
        file("send-x/index.ts", GUARD, GREEN_SEND, '"send-x"'),
        file("literal/index.ts", "fetch(`${url}/functions/v1/send-x`, {});"),
        file(
          "built/index.ts",
          'call("send-x", {});',
          "fetch(`${url}/functions/v1/${name}`);",
        ),
        file("stamped/index.ts", STAMPED_SEND),
        file("named/index.ts", 'const routes = ["send-x"];'),
        file("listed/index.ts", STAMPED_SEND, UNSTAMPED_SEND),
      ],
      lists({
        guarded: { "send-x/index.ts": "in_file" },
        unstampedCallers: {
          "listed/index.ts": "AIO-267 automation",
          "stamped/index.ts": "AIO-267 automation",
        },
      }),
    );
    assertEquals(report.unstampedCallers, [
      "literal/index.ts:1",
      "built/index.ts:1",
    ]);
    assertEquals(report.staleUnstamped, ["stamped/index.ts"]);
  });

  await t.step("one stamped call does not cover another in the file", () => {
    const report = checkCallSites(
      [file("mixed/index.ts", STAMPED_SEND, UNSTAMPED_SEND)],
      lists({ guarded: { "send-x/index.ts": "in_file" } }),
    );
    assertEquals(report.unstampedCallers, ["mixed/index.ts:2"]);
  });

  await t.step("an injected guard does not wire the real one", () => {
    const report = checkCallSites(
      [
        file("split/gateway.ts", GREEN_SEND),
        file(
          "split/prepare.ts",
          "type Deps = { clientSendGuard: ClientSendGuard };",
          "await deps.clientSendGuard(request);",
        ),
      ],
      lists({
        guarded: { "split/gateway.ts": { proof: "split/gateway.test.ts" } },
      }),
    );
    assertEquals(report.folderUnguarded, ["split/gateway.ts"]);
  });
});
