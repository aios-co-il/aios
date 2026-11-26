import { assertEquals } from "jsr:@std/assert@1";
import { UserFacingError, userFacingMessage } from "./user-facing-error.ts";

Deno.test(
  "a user-facing error keeps its message; others get the fallback",
  () => {
    assertEquals(
      userFacingMessage(new UserFacingError("Connect again."), "fallback"),
      "Connect again.",
    );
    assertEquals(
      userFacingMessage(
        new Error("tenant_integrations insert failed"),
        "fallback",
      ),
      "fallback",
    );
    assertEquals(
      userFacingMessage(new Error("db detail")),
      "Something went wrong. Please try again.",
    );
  },
);
