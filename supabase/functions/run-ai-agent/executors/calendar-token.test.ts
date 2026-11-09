import { assertEquals } from "jsr:@std/assert@1";
import { resolveCalendarAccessToken } from "./calendar-access-token.ts";
import { executorClient } from "./test-client.ts";

const token = {
  access_token: "calendar-token",
  refresh_token: "refresh",
  expires_at: "2099-01-01T00:00:00Z",
};

Deno.test(
  "calendar prefers the caller's campaigner profile over explicit user",
  async () => {
    const fixture = executorClient([{ id: "profile" }, token]);
    assertEquals(
      await resolveCalendarAccessToken(
        fixture.context.supabase,
        "t1",
        "staff",
        "explicit",
      ),
      { accessToken: "calendar-token" },
    );
    const queries = fixture.calls.map((call) => new URL(call.url));
    assertEquals(
      queries.map((url) => url.pathname),
      ["/rest/v1/profiles", "/rest/v1/calendar_tokens"],
    );
    assertEquals(queries[0].searchParams.get("campaigner_id"), "eq.staff");
    assertEquals(queries[1].searchParams.get("user_id"), "eq.profile");
  },
);

Deno.test(
  "calendar falls back to tenant owners only after campaigner tokens",
  async () => {
    const fixture = executorClient([
      [{ id: "staff" }],
      { id: "profile" },
      null,
      [{ user_id: "owner" }],
      { user_id: "owner" },
      token,
    ]);
    assertEquals(
      await resolveCalendarAccessToken(
        fixture.context.supabase,
        "t1",
        null,
        "system",
      ),
      { accessToken: "calendar-token" },
    );
    const queries = fixture.calls.map((call) => new URL(call.url));
    assertEquals(
      queries.map((url) => url.pathname),
      [
        "/rest/v1/campaigners",
        "/rest/v1/profiles",
        "/rest/v1/calendar_tokens",
        "/rest/v1/tenant_users",
        "/rest/v1/calendar_tokens",
        "/rest/v1/calendar_tokens",
      ],
    );
    assertEquals(queries[0].searchParams.get("tenant_id"), "eq.t1");
    assertEquals(queries[3].searchParams.get("tenant_id"), "eq.t1");
    assertEquals(queries[3].searchParams.get("role"), "in.(owner,admin)");
    assertEquals(queries[5].searchParams.get("user_id"), "eq.owner");
    assertEquals(
      fixture.calls.every((call) => call.method === "GET"),
      true,
    );
  },
);

Deno.test(
  "calendar does not replace an explicit caller's missing token with another user",
  async () => {
    const fixture = executorClient([null]);
    const result = await resolveCalendarAccessToken(
      fixture.context.supabase,
      "t1",
      null,
      "explicit",
    );
    assertEquals(typeof result.error, "string");
    assertEquals(fixture.calls.length, 1);
    assertEquals(
      new URL(fixture.calls[0].url).searchParams.get("user_id"),
      "eq.explicit",
    );
  },
);
