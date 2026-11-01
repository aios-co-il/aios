import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { isCachedPulseRequest } from "../../_shared/pulse-request.mjs";
import { CALLER_ROLE_PRIORITY } from "../caller-roles.ts";
import {
  CAMPAIGNER,
  CLIENT_CONTACT,
  groupCommand,
  OWNER,
  route,
} from "./fake-callers.ts";
import {
  isBarePulseRefreshRequest,
  isPulseRefreshRequest,
} from "./refresh-request.ts";
import {
  decidePulseRefreshRouting,
  isStaffPulseCaller,
  pulseRefreshToolChoice,
} from "./routing.ts";

const OFF = { forceRefresh: false, digestShortcut: false };

Deno.test("decidePulseRefreshRouting", async (t) => {
  await t.step(
    "bare refresh requests take the WhatsApp/task digest shortcut",
    () => {
      for (const text of [
        "רענני דופק",
        "רענני בדיקת דופק",
        "כרמן, רענני את הדופק",
        "תרענני את בדיקת הדופק",
        "רענון דופק",
        "דופק עדכני",
        "תני לי דופק מעודכן",
        "בדיקת דופק עדכנית",
        "בדיקת דופק מלאה ועדכנית לפי סוכנויות",
        "מה הדופק העדכני?",
        "רענני דופק בבקשה",
        "תריצי את הדופק מחדש",
        "refresh pulse check",
      ]) {
        assertStrictEquals(isBarePulseRefreshRequest(text), true, text);
        assertStrictEquals(isPulseRefreshRequest(text), true, text);
        for (const surface of ["whatsapp", "task"]) {
          assertEquals(
            route(text, { surface }),
            { forceRefresh: true, digestShortcut: true },
            `${surface}: ${text}`,
          );
        }
        // Elsewhere the tool is forced and the model writes the answer.
        assertEquals(route(text, { surface: "internal_chat", caller: OWNER }), {
          forceRefresh: true,
          digestShortcut: false,
        });
      }
    },
  );

  await t.step(
    "send, reminder, report, resume and schedule requests never take the shortcut",
    () => {
      // A refresh word that acts on the pulse: refresh on round 0, then round 1
      // so the model can send or schedule.
      for (const text of [
        "שלחי לפליקס את הדופק המעודכן",
        "תזמני לי כל בוקר ב-8 דופק עדכני לקבוצה",
        "שלחי לקבוצת הקמפיינרים דופק עדכני",
        "תזמני לי משימה: כל בוקר דופק עדכני לפליקס",
        "כל יום ב-8 תשלחי לקבוצת המנהלים דופק עדכני",
      ]) {
        assertStrictEquals(isBarePulseRefreshRequest(text), false, text);
        for (const surface of ["whatsapp", "task"]) {
          assertEquals(
            route(text, { surface }),
            { forceRefresh: true, digestShortcut: false },
            `${surface}: ${text}`,
          );
        }
      }
      // No refresh of the pulse at all: ordinary routing, nothing forced.
      for (const text of [
        "תשלחי מחדש את הדופק לקבוצה של הקמפיינרים",
        "מה הדופק? ותזכירי לי מחר לרענן את הטופס",
        "תעשי בדיקת דוח שיחות מעודכן למאסקיו",
        // run-agent-task's resume prompt ends with "אל תתחיל מחדש".
        "המשך את המשימה שהתחלת. הנה ההקשר: עברי על מצב קמפיינים של כל הלקוחות ופתחי משימה לכל לקוח אדום\n\nאתה ממשיך ריצה קודמת (ריצה מספר 2). המשך מהנקודה שהפסקת — אל תתחיל מחדש.",
        // The verb "ותעדכני" is "let me know", not "up to date".
        "תבדקי את הדופק ותעדכני אותי",
        // Live platform data goes to analyze_campaign_performance.
        "מצב קמפיינים בזמן אמת של לקוח אלפא",
        "רענני את המשימות",
        "בדיקת תקינות מערכות וקמפיינים",
        "עדכני את הלקוח",
      ]) {
        assertStrictEquals(isPulseRefreshRequest(text), false, text);
        assertStrictEquals(isBarePulseRefreshRequest(text), false, text);
        assertEquals(route(text, { surface: "task" }), OFF, text);
      }
    },
  );

  await t.step("bare stored-pulse requests keep the cached fast path", () => {
    for (const text of ["דופק", "בדיקת דופק", "מצב קמפיינים", "pulse check"]) {
      assertStrictEquals(isCachedPulseRequest(text), true, text);
      assertStrictEquals(isPulseRefreshRequest(text), false, text);
      assertEquals(route(text), OFF);
    }
  });

  await t.step(
    "WhatsApp group text never takes the shortcut, and client contacts get nothing forced",
    () => {
      for (const message of [
        "כרמן, מה הדופק העדכני של הקמפיינים שלנו?",
        "אפשר דופק מעודכן?",
        "רענני דופק",
        "דופק עדכני",
      ]) {
        const text = groupCommand(message);
        assertStrictEquals(isBarePulseRefreshRequest(text), false, message);
        // A client contact: no campaigner, no user. Nothing is forced.
        assertEquals(route(text, { caller: CLIENT_CONTACT }), OFF, message);
        // Even the bare message itself, from a client contact.
        assertEquals(route(message, { caller: CLIENT_CONTACT }), OFF);
        // A staff member in the group gets the refresh, then normal routing.
        assertStrictEquals(route(text).digestShortcut, false, message);
      }
      assertStrictEquals(isCachedPulseRequest(groupCommand("דופק")), false);
    },
  );

  await t.step(
    "isolated sessions and other agents never force the refresh",
    () => {
      const base = {
        text: "רענני דופק",
        digestSurface: true,
        caller: CAMPAIGNER,
      };
      assertEquals(
        decidePulseRefreshRouting({
          ...base,
          isCarmen: true,
          pinSkillsOnly: true,
        }),
        OFF,
      );
      assertEquals(
        decidePulseRefreshRouting({ ...base, isCarmen: false }),
        OFF,
      );
      assertEquals(decidePulseRefreshRouting(), OFF);
    },
  );
});

Deno.test("isStaffPulseCaller", async (t) => {
  await t.step(
    "staff callers are a campaigner or a user with a staff role",
    () => {
      assertStrictEquals(isStaffPulseCaller(CAMPAIGNER), true);
      assertStrictEquals(isStaffPulseCaller(OWNER), true);
      assertStrictEquals(
        isStaffPulseCaller({ userId: "u-2", role: "campaigner" }),
        true,
      );
      assertStrictEquals(isStaffPulseCaller(CLIENT_CONTACT), false);
      assertStrictEquals(
        isStaffPulseCaller({ userId: "u-3", role: null }),
        false,
      );
      assertStrictEquals(
        isStaffPulseCaller({ userId: "u-4", role: "client" }),
        false,
      );
      assertStrictEquals(isStaffPulseCaller(undefined), false);
    },
  );

  await t.step("every role run-ai-agent resolves for a caller is staff", () => {
    for (const role of CALLER_ROLE_PRIORITY) {
      assertStrictEquals(
        isStaffPulseCaller({ userId: "u-5", role }),
        true,
        role,
      );
    }
  });
});

Deno.test("pulseRefreshToolChoice", async (t) => {
  const offered = [
    { function: { name: "get_latest_campaign_pulse" } },
    { function: { name: "refresh_campaign_pulse" } },
  ];
  const forced = { forceRefresh: true, digestShortcut: false };

  await t.step("a forced refresh picks refresh_campaign_pulse", () => {
    assertEquals(pulseRefreshToolChoice(forced, offered), {
      type: "function",
      function: { name: "refresh_campaign_pulse" },
    });
  });

  await t.step(
    "nothing is forced when not routed or when the tool was capped",
    () => {
      assertStrictEquals(pulseRefreshToolChoice(OFF, offered), null);
      assertStrictEquals(
        pulseRefreshToolChoice(forced, offered.slice(0, 1)),
        null,
      );
      assertStrictEquals(pulseRefreshToolChoice(forced, [{}]), null);
    },
  );
});
