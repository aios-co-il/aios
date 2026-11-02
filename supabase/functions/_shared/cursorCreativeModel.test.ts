import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isInvalidCursorModelError,
  pickCreativeModelFromCatalog,
  resolveCreativeCursorModel,
} from "./cursorCreativeModel.ts";

Deno.test("composer-2.5-fast is an alias, not a model id", () => {
  assertEquals(resolveCreativeCursorModel("composer-2.5-fast"), {
    id: "composer-2.5",
    params: [{ id: "fast", value: "true" }],
  });
  assertEquals(resolveCreativeCursorModel(""), {
    id: "composer-2.5",
    params: [{ id: "fast", value: "true" }],
  });
  assertStrictEquals(
    resolveCreativeCursorModel("claude-4.6-sonnet-thinking").id,
    "claude-4.6-sonnet-thinking",
  );
});

Deno.test("catalog pick uses the live composer id and fast param", () => {
  const picked = pickCreativeModelFromCatalog(
    [
      {
        id: "composer-2.5",
        aliases: ["composer"],
        parameters: [{ id: "fast", values: [{ value: "true" }] }],
      },
    ],
    { id: "composer-2.5", params: [{ id: "fast", value: "true" }] },
  );
  assertStrictEquals(picked.id, "composer-2.5");
  assertEquals(picked.params, [{ id: "fast", value: "true" }]);
});

Deno.test("invalid model errors are detected for retry-without-model", () => {
  assertStrictEquals(
    isInvalidCursorModelError(
      "Model 'composer-2.5-fast' is not available or invalid",
    ),
    true,
  );
  assertStrictEquals(isInvalidCursorModelError("unauthorized"), false);
});
