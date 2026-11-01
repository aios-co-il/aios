import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { directToolPool } from "../../_shared/carmen-direct-tools.mjs";
import { USER } from "./fake-deps.ts";
import { REFRESH_CAMPAIGN_PULSE_TOOL } from "./tool.ts";
import { missingEnabledTools } from "../missing-enabled-tools.ts";
import { keepCarmenPulseTools, skinToolDenylist } from "./tool-pool.ts";

const LATEST = { name: "get_latest_campaign_pulse" };
const ANALYZE = { name: "analyze_campaign_performance" };
const ALL_TOOLS = [LATEST, ANALYZE, REFRESH_CAMPAIGN_PULSE_TOOL];

/** The pool of an agent whose allowed_tools lists only `allowed`. */
const poolOf = (...allowed: string[]) =>
  ALL_TOOLS.filter((t) => allowed.includes(t.name));

const names = (tools: { name: string }[]) => tools.map((t) => t.name);

Deno.test("keepCarmenPulseTools", async (t) => {
  await t.step(
    "Carmen keeps both pulse tools when allowed_tools omits them",
    () => {
      const pool = keepCarmenPulseTools(
        poolOf("analyze_campaign_performance"),
        ALL_TOOLS,
        { isCarmen: true, disabledTools: [] },
      );
      assertEquals(names(pool), [
        "analyze_campaign_performance",
        "get_latest_campaign_pulse",
        "refresh_campaign_pulse",
      ]);
      assertStrictEquals(pool[2], REFRESH_CAMPAIGN_PULSE_TOOL);
    },
  );

  await t.step(
    "an allowed_tools list that predates the refresh tool gets it",
    () => {
      const pool = keepCarmenPulseTools(
        poolOf("get_latest_campaign_pulse"),
        ALL_TOOLS,
        { isCarmen: true, disabledTools: [] },
      );
      assertEquals(names(pool), [
        "get_latest_campaign_pulse",
        "refresh_campaign_pulse",
      ]);
    },
  );

  await t.step("disabled_tools still turns a pulse tool off", () => {
    const pool = poolOf("get_latest_campaign_pulse");
    assertStrictEquals(
      keepCarmenPulseTools(pool, ALL_TOOLS, {
        isCarmen: true,
        disabledTools: ["refresh_campaign_pulse"],
      }),
      pool,
    );
    assertEquals(
      names(
        keepCarmenPulseTools(poolOf(), ALL_TOOLS, {
          isCarmen: true,
          disabledTools: ["get_latest_campaign_pulse"],
        }),
      ),
      ["refresh_campaign_pulse"],
    );
  });

  await t.step("other agents keep their allowed_tools as is", () => {
    const pool = poolOf("get_latest_campaign_pulse");
    assertStrictEquals(
      keepCarmenPulseTools(pool, ALL_TOOLS, {
        isCarmen: false,
        disabledTools: [],
      }),
      pool,
    );
  });

  await t.step(
    "an unidentified WhatsApp or task caller keeps a narrow allowed_tools",
    () => {
      // A client contact in a client group: no campaigner, no user.
      const pool = poolOf("analyze_campaign_performance");
      for (const surface of ["whatsapp", "task"]) {
        assertStrictEquals(
          keepCarmenPulseTools(pool, ALL_TOOLS, {
            isCarmen: true,
            disabledTools: [],
            caller: { surface, callerCampaignerId: null, callerUserId: null },
          }),
          pool,
          surface,
        );
      }
      for (const caller of [
        { surface: "whatsapp", callerCampaignerId: "c-1" },
        { surface: "task", callerUserId: USER },
        { surface: "internal_chat" },
      ]) {
        assertEquals(
          names(
            keepCarmenPulseTools(pool, ALL_TOOLS, {
              isCarmen: true,
              disabledTools: [],
              caller,
            }),
          ),
          [
            "analyze_campaign_performance",
            "get_latest_campaign_pulse",
            "refresh_campaign_pulse",
          ],
          caller.surface,
        );
      }
    },
  );

  await t.step("a pool that already offers both tools is unchanged", () => {
    assertStrictEquals(
      keepCarmenPulseTools(ALL_TOOLS, ALL_TOOLS, {
        isCarmen: true,
        disabledTools: [],
      }),
      ALL_TOOLS,
    );
  });

  await t.step(
    "the direct_tool pool offers the same pulse tools as chat",
    () => {
      const options = {
        allowedTools: ["analyze_campaign_performance"],
        disabledTools: ["get_latest_campaign_pulse"],
      };
      const pool = keepCarmenPulseTools(
        directToolPool(ALL_TOOLS, options),
        ALL_TOOLS,
        { isCarmen: true, disabledTools: options.disabledTools },
      );
      assertEquals(names(pool), [
        "analyze_campaign_performance",
        "refresh_campaign_pulse",
      ]);
    },
  );
});

Deno.test("skinToolDenylist", async (t) => {
  /** The pool after a matched pulse skin adds its tools, as run-ai-agent does. */
  const afterPulseSkin = (
    caller: Parameters<typeof skinToolDenylist>[1],
    disabledTools: string[] = [],
  ) => {
    const pool = keepCarmenPulseTools(
      poolOf("analyze_campaign_performance"),
      ALL_TOOLS,
      {
        isCarmen: true,
        disabledTools,
        caller,
      },
    );
    const skinTools = ["get_latest_campaign_pulse", "refresh_campaign_pulse"];
    return names([
      ...pool,
      ...missingEnabledTools(
        pool,
        ALL_TOOLS,
        skinTools,
        skinToolDenylist(disabledTools, caller),
      ),
    ]);
  };

  await t.step(
    "a skin adds no pulse tool for an unidentified WhatsApp or task caller",
    () => {
      // ecommerce_pulse fires on "רכישות" and lists both pulse tools.
      for (const surface of ["whatsapp", "task"]) {
        assertEquals(
          afterPulseSkin({
            surface,
            callerCampaignerId: null,
            callerUserId: null,
          }),
          ["analyze_campaign_performance"],
          surface,
        );
      }
    },
  );

  await t.step(
    "staff callers keep the pulse tools, and disabled_tools still wins",
    () => {
      assertEquals(
        afterPulseSkin({ surface: "whatsapp", callerCampaignerId: "c-1" }),
        [
          "analyze_campaign_performance",
          "get_latest_campaign_pulse",
          "refresh_campaign_pulse",
        ],
      );
      assertEquals(
        afterPulseSkin({ surface: "task", callerUserId: USER }, [
          "refresh_campaign_pulse",
        ]),
        ["analyze_campaign_performance", "get_latest_campaign_pulse"],
      );
      const disabled = ["list_leads"];
      assertStrictEquals(
        skinToolDenylist(disabled, { surface: "internal_chat" }),
        disabled,
      );
    },
  );
});
