import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { NOW } from "./fake-deps.ts";
import {
  buildPulseRefreshDigestReply,
  buildPulseRefreshNote,
  formatPulseTime,
} from "./note.ts";

Deno.test("buildPulseRefreshNote", async (t) => {
  await t.step("freshness decision and notes", () => {
    assertStrictEquals(
      buildPulseRefreshNote("fresh_snapshot", {
        // 25.10 is the first day after DST: 05:00 UTC is 07:00 in Israel.
        freshness: "2026-10-25T05:00:00Z",
        now: NOW,
      }),
      "⏱️ בדיקת הדופק כבר עדכנית, ולכן לא הרצתי אותה שוב. זו הבדיקה האחרונה שנשמרה (חושבה ב-25.10 07:00).",
    );
    assertMatch(
      buildPulseRefreshNote("not_configured", { freshness: null, now: NOW }),
      /לא מופעלת לארגון הזה.*אין בדיקת דופק שמורה/,
    );
  });

  await t.step(
    "a lost claim with a newer snapshot says it was refreshed",
    () => {
      assertStrictEquals(
        buildPulseRefreshNote("rate_limited", {
          freshness: "2026-10-26T09:58:00Z",
          now: NOW,
        }),
        "⏱️ הדופק רוענן בדקות האחרונות; אפשר לרענן שוב בעוד כמה דקות. זו הבדיקה האחרונה שנשמרה (חושבה ב-11:58).",
      );
    },
  );
});

Deno.test("formatPulseTime", async (t) => {
  await t.step("today shows the time, an earlier day the date too", () => {
    assertStrictEquals(formatPulseTime("2026-10-26T07:05:00Z", NOW), "09:05");
    assertStrictEquals(
      formatPulseTime("2026-10-05T05:03:00Z", NOW),
      "05.10 08:03",
    );
  });

  await t.step("a missing or invalid time has no label", () => {
    assertStrictEquals(formatPulseTime(null, NOW), null);
    assertStrictEquals(formatPulseTime("not a date", NOW), null);
  });
});

Deno.test("buildPulseRefreshDigestReply", async (t) => {
  await t.step(
    "the WhatsApp refresh reply is the note, then the digest",
    () => {
      assertStrictEquals(
        buildPulseRefreshDigestReply({
          refresh_note: " 🔄 רעננתי את בדיקת הדופק עכשיו (12:00). ",
          whatsapp_digest: "🟢 12 תקינים\n",
        }),
        "🔄 רעננתי את בדיקת הדופק עכשיו (12:00).\n\n🟢 12 תקינים",
      );
      assertStrictEquals(
        buildPulseRefreshDigestReply({ whatsapp_digest: "🟢 12 תקינים" }),
        "🟢 12 תקינים",
      );
      // No digest (refused caller, empty pulse, tool error): no shortcut.
      for (const result of [
        { error: "caller_not_identified", message: "x" },
        { refresh_note: "⚠️", whatsapp_digest: null },
        { refresh_note: "⚠️", whatsapp_digest: "   " },
        null,
      ]) {
        assertStrictEquals(buildPulseRefreshDigestReply(result), null);
      }
    },
  );
});
