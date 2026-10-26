import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { fakeDb } from "../fake-db.ts";
import { resolveAudience } from "./resolve.ts";

const T = "tenant-1";
const lead = (id: string, name: string, phone: string) => ({
  id,
  tenant_id: T,
  contact_name: name,
  company_name: null,
  phone,
  email: null,
  status: "new",
  response_status: "hot",
  sales_person_id: "sp1",
  agency_id: null,
  form_data: {},
});
const tables = {
  leads: [lead("L1", "Dana Cohen", "0501"), lead("L2", "Avi Levi", "0502")],
  clients: [
    {
      id: "C1",
      tenant_id: T,
      contact_name: null,
      name: "Acme",
      phone: "0509",
      email: "a@acme.co",
      status: "active",
      services: [],
      agency_id: null,
    },
  ],
  lead_pipeline_stages: [{ tenant_id: T, stage_key: "new", label: "New" }],
  lead_statuses: [{ tenant_id: T, status_key: "hot", label: "Hot" }],
  sales_people: [{ tenant_id: T, id: "sp1", full_name: "Sam" }],
  campaigners: [{ tenant_id: T, id: "cp1", full_name: "Cami" }],
  agencies: [],
  client_team: [{ client_id: "C1", campaigner_id: "cp1", end_date: null }],
  broadcast_lists: [
    { id: "S", tenant_id: T, source: "manual", kind: "static" },
    { id: "Y", tenant_id: T, source: "crm_filter", kind: "synced" },
    {
      id: "D",
      tenant_id: T,
      source: "crm_filter",
      kind: "dynamic",
      source_config: { source: "leads" },
    },
    {
      id: "N",
      tenant_id: T,
      source: "crm_filter",
      kind: "dynamic",
      source_config: { source: "list", listId: "S" },
    },
  ],
  broadcast_list_members: [
    {
      tenant_id: T,
      list_id: "S",
      entity_type: "lead",
      entity_id: "L1",
      name: null,
      phone: "0599",
      email: null,
      custom_fields: { city: "TLV" },
      created_at: "1",
    },
    {
      tenant_id: T,
      list_id: "Y",
      entity_type: "lead",
      entity_id: "L2",
      name: null,
      phone: null,
      email: null,
      custom_fields: {},
      created_at: "1",
    },
  ],
};
// The RPC owns matching and returns ids in created_at order.
const matching: Record<string, string[]> = {
  lead: ["L2", "L1"],
  client: ["C1"],
};
const db = () =>
  fakeDb(tables, {
    broadcast_matching_entity_ids: (a) => matching[String(a.p_entity_type)],
  });

Deno.test(
  "leads come back as recipients in the RPC's order, with labels",
  async () => {
    const r = await resolveAudience(db().db, T, { source: "leads" });
    assertEquals(
      r.map((x) => x.entity_id),
      ["L2", "L1"],
    );
    assertEquals(r[1], {
      entity_type: "lead",
      entity_id: "L1",
      phone: "0501",
      email: null,
      contact_name: "Dana Cohen",
      vars: {
        contact_name: "Dana Cohen",
        name: "Dana Cohen",
        first_name: "Dana",
        phone: "0501",
        sales_person_name: "Sam",
        lead_stage: "New",
        lead_status: "Hot",
      },
    });
  },
);

Deno.test("clients carry their campaigner and status label", async () => {
  const fake = db();
  const [c] = await resolveAudience(fake.db, T, { source: "clients" });
  assertStrictEquals(c.contact_name, "Acme");
  assertStrictEquals(c.vars.campaigner_name, "Cami");
  assertStrictEquals(c.vars.client_status, "פעיל");
  assertStrictEquals(fake.rpcCalls[0].args.p_entity_type, "client");
});

Deno.test(
  "a static list returns its members; the member phone wins",
  async () => {
    const [m] = await resolveAudience(db().db, T, {
      source: "list",
      listId: "S",
    });
    assertStrictEquals(m.entity_id, "L1");
    assertStrictEquals(m.phone, "0599");
    assertStrictEquals(m.vars.phone, "0599");
    assertStrictEquals(m.vars.city, "TLV");
  },
);

Deno.test(
  "a synced list reads its stored members, not the filter",
  async () => {
    const fake = db();
    const r = await resolveAudience(fake.db, T, {
      source: "list",
      listId: "Y",
    });
    assertEquals(
      r.map((x) => x.entity_id),
      ["L2"],
    );
    assertEquals(fake.rpcCalls, []);
  },
);

Deno.test("a dynamic CRM list resolves its filter live", async () => {
  const r = await resolveAudience(db().db, T, { source: "list", listId: "D" });
  assertEquals(
    r.map((x) => x.entity_id),
    ["L2", "L1"],
  );
});

Deno.test("a dynamic list pointing at a list is not nested", async () => {
  const r = await resolveAudience(db().db, T, { source: "list", listId: "N" });
  assertEquals(r, []);
});

Deno.test("includeIds and excludeIds narrow the source", async () => {
  const inc = await resolveAudience(db().db, T, {
    source: "leads",
    includeIds: ["L1"],
  });
  assertEquals(
    inc.map((x) => x.entity_id),
    ["L1"],
  );
  const exc = await resolveAudience(db().db, T, {
    source: "leads",
    excludeIds: ["L1"],
  });
  assertEquals(
    exc.map((x) => x.entity_id),
    ["L2"],
  );
});
