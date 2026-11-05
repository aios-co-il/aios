import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  hasPulseIntent,
  isCachedPulseRequest,
} from "../../_shared/pulse-request.mjs";
import { route } from "./fake-callers.ts";
import {
  isBarePulseRefreshRequest,
  isPulseRefreshRequest,
} from "./refresh-request.ts";

Deno.test("isPulseRefreshRequest", async (t) => {
  await t.step(
    "refresh phrases go to refresh_campaign_pulse; bare requests keep the fast path",
    () => {
      for (const text of [
        "רענני דופק",
        "רענני בדיקת דופק",
        "דופק עדכני",
        "תני לי דופק מעודכן",
        "בדיקת דופק מלאה ועדכנית לפי סוכנויות",
        "תריצי את הדופק מחדש",
        "refresh pulse check",
      ]) {
        assertStrictEquals(isPulseRefreshRequest(text), true, text);
        assertStrictEquals(isCachedPulseRequest(text), false, text);
      }
      for (const text of [
        "דופק",
        "בדיקת דופק",
        "מצב קמפיינים",
        "pulse check",
      ]) {
        assertStrictEquals(isCachedPulseRequest(text), true, text);
        assertStrictEquals(isPulseRefreshRequest(text), false, text);
      }
      for (const text of [
        "רענני את המשימות",
        "בדיקת תקינות מערכות וקמפיינים",
        "עדכני את הלקוח",
      ]) {
        assertStrictEquals(
          hasPulseIntent(text) && isPulseRefreshRequest(text),
          false,
        );
      }
    },
  );

  await t.step(
    "a dative or please between the verb and the pulse still means refresh",
    () => {
      for (const text of [
        "תרענני לי את הדופק",
        "רענני לי דופק",
        "רענני לנו את בדיקת הדופק",
        "תרענני לי בבקשה את הדופק",
        "כרמן, רענני בבקשה את הדופק",
        "תריצי לי את הדופק מחדש",
      ]) {
        assertStrictEquals(isPulseRefreshRequest(text), true, text);
        assertStrictEquals(isBarePulseRefreshRequest(text), true, text);
        assertEquals(
          route(text),
          { forceRefresh: true, digestShortcut: true },
          text,
        );
      }
      // With a send it is still a refresh, but never the shortcut.
      for (const text of [
        "תרענני לי את הדופק ותשלחי לפליקס",
        "אפשר לרענן לי את הדופק ולשלוח לקבוצה?",
      ]) {
        assertStrictEquals(isPulseRefreshRequest(text), true, text);
        assertStrictEquals(isBarePulseRefreshRequest(text), false, text);
        assertEquals(
          route(text),
          { forceRefresh: true, digestShortcut: false },
          text,
        );
      }
    },
  );

  await t.step("a negated refresh verb forces nothing", () => {
    for (const text of [
      "אל תרענני את הדופק, רק תגידי מה המצב",
      "אל תרענני לי את הדופק",
      "ואל תרענני את הדופק",
      "לא צריך לרענן את הדופק, תני לי את מה שיש",
      "אין צורך לרענן את הדופק",
      "בלי לרענן את הדופק, מה המצב?",
      "אל תריצי את הדופק מחדש",
      "don't refresh the pulse",
    ]) {
      assertStrictEquals(isPulseRefreshRequest(text), false, text);
      assertStrictEquals(isBarePulseRefreshRequest(text), false, text);
      for (const surface of ["whatsapp", "task"]) {
        assertEquals(
          route(text, { surface }),
          { forceRefresh: false, digestShortcut: false },
          `${surface}: ${text}`,
        );
      }
    }
    // A negation elsewhere in the message does not cancel the refresh.
    for (const text of [
      "לא, תרענני את הדופק",
      "אל תשלחי לפליקס, רק תרענני את הדופק",
      "ישראל רענני את הדופק",
    ]) {
      assertStrictEquals(isPulseRefreshRequest(text), true, text);
    }
  });
});

Deno.test("isBarePulseRefreshRequest", async (t) => {
  await t.step(
    "trailing punctuation and spaces do not count as extra text",
    () => {
      for (const text of ["רענני דופק!", "  דופק עדכני?  ", "refresh pulse."]) {
        assertStrictEquals(isBarePulseRefreshRequest(text), true, text);
      }
      assertStrictEquals(isBarePulseRefreshRequest(null), false);
    },
  );
});
