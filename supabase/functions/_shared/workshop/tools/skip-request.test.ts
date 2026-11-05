import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { skipAskedByUser, skipRefused } from "./skip-request.ts";

Deno.test("a skip the user asked for in words counts for its own step", () => {
  assertStrictEquals(
    skipAskedByUser("concepts", "בלי קונספטים, ישר לסצנות", 15),
    true,
  );
  assertStrictEquals(skipAskedByUser("script", "בלי תסריט בבקשה", 15), true);
  assertStrictEquals(skipAskedByUser("script", "ישר להפקה", 15), true);
  // "No script" does not skip the concepts.
  assertStrictEquals(skipAskedByUser("concepts", "בלי תסריט", 15), false);
});

Deno.test("a message that is not a skip or a script is refused", () => {
  assertStrictEquals(
    skipAskedByUser("concepts", "סרטון לפסח על מבצע חיסכון למשפחות", 15),
    false,
  );
  assertStrictEquals(
    skipAskedByUser("script", "מאשרת, אפשר להמשיך", 15),
    false,
  );
});

Deno.test("the user's own full script skips both steps", () => {
  const script = [
    "פתיחה: משפחה סביב שולחן החג, כולם מחייכים",
    "קריינות: פסח הזה חוסכים יותר וחוגגים יחד",
    "סיום: לוגו והמבצע, עשרים אחוז הנחה עד החג",
  ].join("\n");
  assertStrictEquals(skipAskedByUser("concepts", script, 15), true);
  assertStrictEquals(skipAskedByUser("script", script, 15), true);
});

Deno.test(
  "a refused skip tells Carmen the next step and how the user skips",
  () => {
    assertMatch(skipRefused("concepts"), /בלי קונספט, ישר לסצנות/);
    assertMatch(skipRefused("script"), /בלי תסריט, ישר לסצנות/);
  },
);
