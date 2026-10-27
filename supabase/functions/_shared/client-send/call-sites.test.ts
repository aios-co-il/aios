import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import {
  CALL_SITE_LISTS,
  type CallSiteLists,
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
  for (const note of [
    ...Object.values(CALL_SITE_LISTS.bypasses),
    ...Object.values(CALL_SITE_LISTS.unstampedCallers),
  ]) {
    assertMatch(note, /^AIO-(261\(b\)|246|248|267) \S/);
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

  await t.step("callers of a guarded sender must name a sendKind", () => {
    const report = checkCallSites(
      [
        file("send-x/index.ts", GUARD, GREEN_SEND, '"send-x"'),
        file("literal/index.ts", "fetch(`${url}/functions/v1/send-x`)"),
        file("built/index.ts", 'call("send-x"); `functions/v1/${name}`'),
        file("stamped/index.ts", "`functions/v1/send-x` sendKind"),
        file("named/index.ts", 'const routes = ["send-x"];'),
        file("listed/index.ts", "fetch(`${url}/functions/v1/send-x`)"),
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
      "literal/index.ts",
      "built/index.ts",
    ]);
    assertEquals(report.staleUnstamped, ["stamped/index.ts"]);
  });
});
