import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import {
  buildStaffWhatsappAcceptanceCases,
  formatStaffContact,
  normalizeStaffPhone,
  selectStaffMatch,
  scoreNameMatch,
} from "./staff-whatsapp.mjs";

const { ana, david } = buildStaffWhatsappAcceptanceCases();
const roster = [
  { ...ana, role: ["קמפיינר"] },
  { ...david, role: ["קמפיינר"] },
  {
    id: "sp-1",
    full_name: "ישראל ישראלי",
    phone: "0521112233",
    entity_type: "sales_person",
  },
];

Deno.test("normalize Israeli staff phones to 972…", () => {
  assertStrictEquals(normalizeStaffPhone("0545612156"), "972545612156");
  assertStrictEquals(normalizeStaffPhone("972545612156"), "972545612156");
  assertStrictEquals(normalizeStaffPhone("545612156"), "972545612156");
  assertStrictEquals(normalizeStaffPhone(""), null);
});

Deno.test("select Ana campaigner by id", () => {
  const { match, reason } = selectStaffMatch(roster, {
    id: ana.id,
    entityType: "campaigner",
  });
  assertStrictEquals(reason, "id");
  assertStrictEquals(match?.full_name, "אנה");
  assertStrictEquals(formatStaffContact(match)?.phone, "972545612156");
});

Deno.test("select staff by Hebrew name", () => {
  const { match } = selectStaffMatch(roster, { name: "אנה" });
  assertStrictEquals(match?.id, ana.id);
  assert(scoreNameMatch("אנה", "אנה") >= 100);
});

Deno.test("ambiguous name returns candidates (no silent pick)", () => {
  const dupes = [
    {
      id: "a",
      full_name: "דני",
      phone: "0501111111",
      entity_type: "campaigner",
    },
    {
      id: "b",
      full_name: "דני",
      phone: "0502222222",
      entity_type: "sales_person",
    },
  ];
  const { match, ambiguous, reason } = selectStaffMatch(dupes, { name: "דני" });
  assertStrictEquals(match, null);
  assertStrictEquals(reason, "ambiguous_name");
  assertStrictEquals(ambiguous?.length, 2);
});

Deno.test("sales_person filter works", () => {
  const { match } = selectStaffMatch(roster, {
    name: "ישראל",
    entityType: "sales_person",
  });
  assertStrictEquals(match?.entity_type, "sales_person");
  assertStrictEquals(formatStaffContact(match)?.phone, "972521112233");
});

Deno.test("formatStaffContact never invents a phone", () => {
  const formatted = formatStaffContact({
    id: "x",
    full_name: "בלי טלפון",
    phone: null,
    entity_type: "campaigner",
  });
  assertStrictEquals(formatted.has_phone, false);
  assertStrictEquals(formatted.phone, null);
});
