import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { buildLeadNotes, extractLeads, firstText } from "./parse-leads.ts";

Deno.test("firstText returns the first truthy value as text", () => {
  assertStrictEquals(firstText(undefined, "", "Dana"), "Dana");
  assertStrictEquals(firstText(0, 1234567), "1234567");
  assertStrictEquals(firstText(null, undefined), "");
  assertStrictEquals(firstText({ name: "x" }, "later"), "");
});

const metaWebhook = {
  object: "page",
  entry: [
    {
      id: "PAGE_1",
      time: 1729900000,
      changes: [
        {
          field: "leadgen",
          value: {
            leadgen_id: 1234567890123456,
            form_id: 444555666,
            ad_id: "120200000000001",
            page_id: "PAGE_1",
            created_time: 1729900000,
          },
        },
        { field: "feed", value: { item: "post" } },
      ],
    },
    {
      id: "PAGE_2",
      changes: [{ field: "leadgen", value: { leadgen_id: "77" } }],
    },
  ],
};

Deno.test(
  "extractLeads reads Meta direct webhooks across entry[].changes[]",
  () => {
    const leads = extractLeads(metaWebhook);
    assertEquals(
      leads.map(({ leadgen_id, form_name, campaign_name }) => ({
        leadgen_id,
        form_name,
        campaign_name,
      })),
      [
        {
          leadgen_id: "1234567890123456",
          form_name: "444555666",
          campaign_name: "120200000000001",
        },
        { leadgen_id: "77", form_name: undefined, campaign_name: undefined },
      ],
    );
    assertStrictEquals(leads[0].raw, metaWebhook.entry[0].changes[0].value);
  },
);

Deno.test("extractLeads tolerates entries without a changes list", () => {
  assertEquals(extractLeads({ entry: [{ id: "P" }, null] }), []);
});

Deno.test("extractLeads reads a Unified.to single lead", () => {
  const [lead] = extractLeads({
    id: "u1",
    name: "Dana Levi",
    emails: [{ email: "dana@example.com" }],
    telephones: [{ telephone: "050-1234567" }],
    company_name: "Levi Ltd",
  });
  assertStrictEquals(lead.name, "Dana Levi");
  assertStrictEquals(lead.contact_name, "Dana Levi");
  assertStrictEquals(lead.email, "dana@example.com");
  assertStrictEquals(lead.phone, "050-1234567");
  assertStrictEquals(lead.company_name, "Levi Ltd");
});

const genericItem = {
  full_name: "Avi Cohen",
  Email: "avi@example.com",
  phone_number: 972501234567,
  form_id: 987,
  campaign_id: "c-1",
  ad_name: "Spring",
  id: "lead-9",
};

const expectedGeneric = {
  name: "Avi Cohen",
  contact_name: "Avi Cohen",
  full_name: "Avi Cohen",
  email: "avi@example.com",
  phone: "972501234567",
  company_name: "",
  form_name: "987",
  campaign_name: "c-1",
  ad_name: "Spring",
  leadgen_id: "lead-9",
};

const genericShapes: Array<[string, unknown]> = [
  ["a top-level array", [genericItem]],
  ["a Make.com data array", { data: [genericItem] }],
  ["a single lead object", { ...genericItem, email: "avi@example.com" }],
  ["a lead wrapped in `lead`", { lead: genericItem }],
];

for (const [name, body] of genericShapes) {
  Deno.test(`extractLeads parses ${name}`, () => {
    const [lead] = extractLeads(body);
    const { raw: _raw, ...fields } = lead;
    assertEquals(fields, expectedGeneric);
  });
}

Deno.test("extractLeads ignores bodies without a known shape", () => {
  assertEquals(extractLeads({ hello: "world" }), []);
  assertEquals(extractLeads(null), []);
  assertEquals(extractLeads("text"), []);
});

Deno.test("buildLeadNotes lists the known Meta identifiers", () => {
  assertStrictEquals(
    buildLeadNotes({ form_name: "987", leadgen_id: "1234567890123456" }),
    "מקור: Meta Lead Ads\nטופס: 987\nleadgen_id: 1234567890123456",
  );
});

Deno.test(
  "extractLeads keeps leadgen changes whose value is not an object",
  () => {
    const leads = extractLeads({
      entry: [
        {
          changes: [
            { field: "leadgen", value: "opaque" },
            { field: "leadgen", value: null },
            ["leadgen"],
          ],
        },
      ],
    });
    assertEquals(leads, [
      {
        leadgen_id: undefined,
        form_name: undefined,
        campaign_name: undefined,
        raw: "opaque",
      },
    ]);
  },
);

Deno.test(
  "extractLeads reads Unified.to leads with missing contact lists",
  () => {
    const [lead] = extractLeads({
      id: "u2",
      name: "Noa",
      emails: [],
      telephones: "050",
      phone: 501234567,
    });
    assertStrictEquals(lead.email, undefined);
    assertStrictEquals(lead.phone, "501234567");
  },
);
