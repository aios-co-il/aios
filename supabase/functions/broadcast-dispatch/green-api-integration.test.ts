import { assertEquals } from "jsr:@std/assert@1";
import { greenApiIntegrationFrom } from "./green-api-integration.ts";

Deno.test(
  "greenApiIntegrationFrom reads the token, instance and country code",
  () => {
    assertEquals(
      greenApiIntegrationFrom({
        api_key: "tok",
        settings: { instance_id: 7103, country_code: "44" },
      }),
      { apiToken: "tok", instanceId: "7103", countryCode: "44" },
    );
  },
);

Deno.test(
  "greenApiIntegrationFrom falls back to the default country code, then 972",
  () => {
    assertEquals(
      greenApiIntegrationFrom({
        api_key: "tok",
        settings: { instance_id: "1", default_country_code: 1 },
      })?.countryCode,
      "1",
    );
    assertEquals(
      greenApiIntegrationFrom({
        api_key: "tok",
        settings: { instance_id: "1" },
      })?.countryCode,
      "972",
    );
  },
);

Deno.test(
  "greenApiIntegrationFrom is null without a token or an instance",
  () => {
    assertEquals(greenApiIntegrationFrom(null), null);
    assertEquals(
      greenApiIntegrationFrom({
        api_key: null,
        settings: { instance_id: "1" },
      }),
      null,
    );
    assertEquals(
      greenApiIntegrationFrom({ api_key: "tok", settings: ["1"] }),
      null,
    );
    assertEquals(
      greenApiIntegrationFrom({
        api_key: "tok",
        settings: { instance_id: "" },
      }),
      null,
    );
  },
);
