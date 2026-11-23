import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { fakeDirectory } from "../tests/fake-directory.ts";
import { fakeFindingsStore } from "../tests/fake-findings.ts";
import { finding, TENANT, type World, world } from "../tests/fake-world.ts";
import { gatherBrief, type GatherDeps } from "./gather.ts";

const SINCE = "2026-10-01T00:00:00Z";
const LINK = "https://aios.test/t/acme/card-drafts";

/** gatherBrief over `w` in david_only mode; `link` answers the drafts link. */
function gather(
  w: World,
  link: GatherDeps["cardDraftsLink"] = () => Promise.resolve(LINK),
) {
  const links: Array<string> = [];
  const deps: GatherDeps = {
    findings: fakeFindingsStore(w),
    deliveries: {
      activitySince: () => Promise.resolve({ autoCleared: 0, messages: 0 }),
    },
    directory: fakeDirectory(w),
    cardDraftsLink: (tenantId) => {
      links.push(tenantId);
      return link(tenantId);
    },
  };
  const content = gatherBrief(deps, {
    tenantId: TENANT,
    settings: resolveManagerSettings({
      manager: { mode: "david_only", notify_since: SINCE },
    }),
    now: w.now,
    floors: {},
  });
  return { content, links };
}

/** A card draft at the owner level; `fields` override. */
function draft(fields: Parameters<typeof finding>[0] = {}) {
  return finding({
    kind: "card_stale_group",
    escalation_level: 2,
    status: "notified",
    ...fields,
  });
}

Deno.test("gatherBrief", async (t) => {
  await t.step(
    "counts the card drafts it may tell about instead of listing them",
    async () => {
      const w = world();
      w.findings.push(
        finding({ short_code: 5, escalation_level: 2, status: "notified" }),
        draft({ short_code: 6 }),
        draft({ short_code: 7, severity: "critical", escalation_level: 0 }),
        draft({ short_code: 8, source_event_at: "2026-09-01T00:00:00Z" }),
        draft({ short_code: 9, escalation_level: 0 }),
        draft({ short_code: 10, status: "acknowledged" }),
      );

      const { content, links } = gather(w);
      const brief = await content;

      assertEquals(
        brief.decisions.map((f) => f.short_code),
        [5],
      );
      assertEquals(brief.pendingDrafts, { count: 2, link: LINK });
      assertEquals(links, [TENANT]);
    },
  );

  await t.step("reads no link when no draft waits", async () => {
    const w = world();
    w.findings.push(finding({ escalation_level: 2, status: "notified" }));

    const { content, links } = gather(w);

    assertEquals((await content).pendingDrafts, { count: 0, link: null });
    assertEquals(links, []);
  });

  await t.step(
    "a failed link read keeps the count without a link",
    async () => {
      const w = world();
      w.findings.push(draft());

      const { content } = gather(w, () => Promise.reject(new Error("db down")));

      assertEquals((await content).pendingDrafts, { count: 1, link: null });
    },
  );
});
