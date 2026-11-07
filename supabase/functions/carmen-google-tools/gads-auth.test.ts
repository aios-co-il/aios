import { assertEquals } from "jsr:@std/assert@1";
import { gadsAuthFromIntegration } from "./gads-auth.ts";

Deno.test("gads auth reads the stored config", () => {
  assertEquals(
    gadsAuthFromIntegration(
      {
        api_key: "rk",
        additional_config: {
          developer_token: "dev",
          mcc_id: 123,
          client_id: "cid",
          client_secret: "sec",
        },
      },
      {},
    ),
    {
      refresh_token: "rk",
      developer_token: "dev",
      login_customer_id: "123",
      client_id: "cid",
      client_secret: "sec",
    },
  );
});

Deno.test("gads auth prefers env values and the config refresh token", () => {
  assertEquals(
    gadsAuthFromIntegration(
      {
        api_key: "rk",
        additional_config: {
          refresh_token: "cfg-rt",
          login_customer_id: "lc",
          client_id: "cid",
        },
      },
      { developerToken: "env-dev", clientId: "env-cid", clientSecret: "env-s" },
    ),
    {
      refresh_token: "cfg-rt",
      developer_token: "env-dev",
      login_customer_id: "lc",
      client_id: "env-cid",
      client_secret: "env-s",
    },
  );
});

Deno.test("gads auth tolerates missing or malformed config", () => {
  const empty = {
    refresh_token: undefined,
    developer_token: undefined,
    login_customer_id: undefined,
    client_id: undefined,
    client_secret: undefined,
  };
  for (const row of [
    {},
    { additional_config: null },
    { additional_config: "x" },
    null,
  ]) {
    assertEquals(gadsAuthFromIntegration(row, {}), empty);
  }
  assertEquals(
    gadsAuthFromIntegration({ api_key: "rk", additional_config: [] }, {})
      .refresh_token,
    "rk",
  );
});
