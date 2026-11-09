import {
  assert,
  assertEquals,
  assertObjectMatch,
  assertRejects,
} from "jsr:@std/assert@1";
import { executorClient } from "./test-client.ts";
import { executeLeadTool } from "./lead-tools.ts";

Deno.test(
  "lead creation retains agency lookup, override order, and result contract",
  async () => {
    const fixture = executorClient([
      { id: "agency" },
      { id: "lead", company_name: "Contact", status: "new" },
    ]);
    const args = {
      contact_name: "Contact",
      tenant_id: "forged",
      agency_id: "forged",
      status: "won",
      source: "web",
    };
    const result = await executeLeadTool(
      { name: "create_lead", args },
      fixture.context,
    );
    assertEquals(result, {
      lead_id: "lead",
      company_name: "Contact",
      status: "new",
    });
    assertEquals(
      fixture.calls.map((call) => [call.method, new URL(call.url).pathname]),
      [
        ["GET", "/rest/v1/agencies"],
        ["POST", "/rest/v1/leads"],
      ],
    );
    assertEquals(
      new URL(fixture.calls[0].url).searchParams.get("tenant_id"),
      "in.(t1,shared)",
    );
    assertEquals(fixture.calls[1].body, {
      contact_name: "Contact",
      tenant_id: "t1",
      agency_id: "agency",
      status: "new",
      source: "web",
      company_name: "Contact",
    });
  },
);

Deno.test(
  "lead listing retains scope, limit defaults, and optional status filter",
  async () => {
    const lead = {
      id: "lead",
      company_name: "Existing",
      contact_name: null,
      phone: null,
      status: "new",
      source: "web",
      created_at: "2026-01-01T00:00:00Z",
    };
    const fixture = executorClient([[lead]]);
    assertEquals(
      await executeLeadTool(
        { name: "list_leads", args: { limit: 0, status: "new" } },
        fixture.context,
      ),
      {
        count: 1,
        leads: [lead],
      },
    );
    const query = new URL(fixture.calls[0].url).searchParams;
    assertEquals(query.get("tenant_id"), "in.(t1,shared)");
    assertEquals(query.get("status"), "eq.new");
    assertEquals(query.get("limit"), "20");
    assertEquals(query.get("order"), "created_at.desc");
  },
);

Deno.test(
  "lead update preserves explicit nulls, omissions, and tenant filters",
  async () => {
    const fixture = executorClient([
      { id: "lead", company_name: "Existing", status: "new" },
    ]);
    const row = await executeLeadTool(
      {
        name: "update_lead",
        args: {
          lead_id: "lead",
          company_name: "",
          contact_name: null,
          notes: null,
        },
      },
      fixture.context,
    );
    assertEquals(row, { id: "lead", company_name: "Existing", status: "new" });
    assertEquals(fixture.calls[0].body, { contact_name: null, notes: null });
    const query = new URL(fixture.calls[0].url).searchParams;
    assertEquals(query.get("id"), "eq.lead");
    assertEquals(query.get("tenant_id"), "in.(t1,shared)");
  },
);

Deno.test("lead writes propagate provider errors", async () => {
  const fixture = executorClient(
    [{ message: "write denied", code: "42501" }],
    403,
  );
  await assertRejects(
    async () => {
      try {
        await executeLeadTool(
          {
            name: "update_lead_status",
            args: { lead_id: "lead", status: "won" },
          },
          fixture.context,
        );
      } catch (error) {
        assert(error !== null && typeof error === "object");
        assertObjectMatch(error, { message: "write denied", code: "42501" });
        throw new Error("propagated");
      }
    },
    Error,
    "propagated",
  );
});
