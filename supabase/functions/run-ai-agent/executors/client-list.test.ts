import { assertEquals } from "jsr:@std/assert@1";
import { listClients } from "./client-list.ts";
import { executorClient } from "./test-client.ts";

Deno.test(
  "an unmatched agency stops client listing before other lookups",
  async () => {
    const fixture = executorClient([[]]);
    assertEquals(
      await listClients(
        { agency_name: "Missing", campaigner_name: "Someone" },
        fixture.context,
      ),
      {
        count: 0,
        clients: [],
        note: 'no agency matched "Missing"',
      },
    );
    assertEquals(fixture.calls.length, 1);
    assertEquals(new URL(fixture.calls[0].url).pathname, "/rest/v1/agencies");
  },
);

Deno.test(
  "campaigner defaults retain assigned clients and active/onboarding status",
  async () => {
    const row = {
      id: "client",
      name: "Existing",
      contact_name: null,
      phone: null,
      status: "active",
      agency_id: "agency",
      agencies: { name: "Agency" },
    };
    const fixture = executorClient([[{ client_id: "client" }], [row]], 200, {
      callerCampaignerId: "campaigner",
    });
    const result = await listClients({}, fixture.context);
    assertEquals(result, {
      count: 1,
      clients: [
        {
          id: "client",
          name: "Existing",
          contact_name: null,
          phone: null,
          status: "active",
          agency_id: "agency",
          agency_name: "Agency",
        },
      ],
      scope_note:
        "auto-scoped to caller campaigner (active+onboarding only). pass all_scopes=true or explicit campaigner_name/agency_name to widen.",
    });
    assertEquals(
      fixture.calls.map((call) => new URL(call.url).pathname),
      ["/rest/v1/client_team", "/rest/v1/clients"],
    );
    const query = new URL(fixture.calls[1].url).searchParams;
    assertEquals(query.get("status"), "in.(active,onboarding)");
    assertEquals(query.get("id"), "in.(client)");
    assertEquals(query.get("tenant_id"), "in.(t1,shared)");
  },
);

Deno.test(
  "team managers retain their managed-agency filter without a status default",
  async () => {
    const fixture = executorClient([[]], 200, {
      isTeamManager: true,
      managedAgencyIds: ["agency1", "agency2"],
    });
    assertEquals(await listClients({}, fixture.context), {
      count: 0,
      clients: [],
      scope_note: undefined,
    });
    const query = new URL(fixture.calls[0].url).searchParams;
    assertEquals(query.get("agency_id"), "in.(agency1,agency2)");
    assertEquals(query.has("status"), false);
  },
);
