import { assertEquals } from "jsr:@std/assert@1";
import {
  isSendingMode,
  kindMode,
  kindNotifySince,
  sendsAnything,
} from "./modes.ts";
import { resolveManagerSettings } from "./settings.ts";

Deno.test(
  "kindMode and kindNotifySince follow the database guard",
  async (t) => {
    const settings = resolveManagerSettings({
      manager: {
        mode: "david_only",
        notify_since: "2026-10-20T06:00:00Z",
        kinds: {
          no_contact: { mode: "team", notify_since: "2026-10-25T06:00:00Z" },
          data_gap: { enabled: false },
          roas_drop: { mode: "shout" },
          cost_spike: { card_write: true },
          not_a_kind: { mode: "team" },
        },
      },
    });

    await t.step(
      "override, disabled, unknown override and inherited mode",
      () => {
        assertEquals(kindMode(settings, "no_contact"), "team");
        assertEquals(kindMode(settings, "data_gap"), "off");
        assertEquals(kindMode(settings, "roas_drop"), "observe");
        assertEquals(kindMode(settings, "cost_spike"), "david_only");
        assertEquals(kindMode(settings, "client_complaint"), "david_only");
        assertEquals(Object.keys(settings.kinds).includes("not_a_kind"), false);
        assertEquals(settings.kinds.cost_spike?.card_write, true);
      },
    );

    await t.step("a listed kind uses only its own stamp", () => {
      assertEquals(
        kindNotifySince(settings, "no_contact"),
        "2026-10-25T06:00:00Z",
      );
      assertEquals(kindNotifySince(settings, "cost_spike"), null);
      assertEquals(
        kindNotifySince(settings, "client_complaint"),
        "2026-10-20T06:00:00Z",
      );
    });

    await t.step("a kind override that sends makes the tenant send", () => {
      assertEquals(
        sendsAnything(resolveManagerSettings({ manager: { mode: "observe" } })),
        false,
      );
      assertEquals(sendsAnything(settings), true);
      const kindOnly = resolveManagerSettings({
        manager: { mode: "observe", kinds: { no_contact: { mode: "team" } } },
      });
      assertEquals(sendsAnything(kindOnly), true);
      const disabled = resolveManagerSettings({
        manager: {
          mode: "observe",
          kinds: { no_contact: { mode: "team", enabled: false } },
        },
      });
      assertEquals(sendsAnything(disabled), false);
    });

    await t.step("only david_only and team send", () => {
      assertEquals(
        ["off", "observe", "david_only", "team"].map((mode) =>
          isSendingMode(resolveManagerSettings({ manager: { mode } }).mode),
        ),
        [false, false, true, true],
      );
    });
  },
);
