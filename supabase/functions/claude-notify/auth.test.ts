import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { authorizeNotifyRequest } from "./auth.ts";
import { BEARER, SERVICE_KEY } from "./test-fixtures.ts";

Deno.test("authorizeNotifyRequest", async (t) => {
  await t.step(
    "no bearer with CLAUDE_MCP_BEARER unset is refused (fails closed)",
    () => {
      assertEquals(
        authorizeNotifyRequest({
          authorization: null,
          serviceRoleKey: SERVICE_KEY,
        }),
        { ok: false },
      );
      assertEquals(
        authorizeNotifyRequest({
          authorization: "Bearer anything",
          bearerSecret: "",
          serviceRoleKey: SERVICE_KEY,
        }),
        { ok: false },
      );
    },
  );

  await t.step(
    "CLAUDE_MCP_BEARER and this project's service-role key are both accepted",
    () => {
      assertEquals(
        authorizeNotifyRequest({
          authorization: `Bearer ${BEARER}`,
          bearerSecret: BEARER,
          serviceRoleKey: SERVICE_KEY,
        }),
        { ok: true, via: "bearer" },
      );
      for (const bearerSecret of [BEARER, null, ""]) {
        assertEquals(
          authorizeNotifyRequest({
            authorization: `Bearer ${SERVICE_KEY}`,
            bearerSecret,
            serviceRoleKey: SERVICE_KEY,
          }),
          { ok: true, via: "service_role" },
        );
      }
    },
  );

  await t.step("a wrong token or an empty service key never matches", () => {
    assertStrictEquals(
      authorizeNotifyRequest({
        authorization: "Bearer other",
        bearerSecret: BEARER,
        serviceRoleKey: SERVICE_KEY,
      }).ok,
      false,
    );
    assertStrictEquals(
      authorizeNotifyRequest({
        authorization: "Bearer ",
        bearerSecret: "",
        serviceRoleKey: "",
      }).ok,
      false,
    );
  });
});
