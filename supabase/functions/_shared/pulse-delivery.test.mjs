import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { buildPulseWhatsAppDigest } from "./campaign-pulse.ts";
import {
  buildPulsePreviewMessage,
  buildPulseMissingPhoneAlert,
  filterPulsePlansByCampaignerName,
  findCampaignersMissingPulsePhone,
  mergePulseDeliveryPlans,
  planCampaignerPulseDeliveries,
  planTeamManagerPulseDeliveries,
  scopeSnapshotsForPlan,
} from "./pulse-delivery.ts";

const SNAPSHOTS = [
  { client_id: "c1", agency_id: "a1", client_name: "Alpha", status: "healthy" },
  { client_id: "c2", agency_id: "a1", client_name: "Beta", status: "warning" },
  {
    client_id: "c3",
    agency_id: "a2",
    client_name: "Gamma",
    status: "critical",
  },
];

Deno.test(
  "planCampaignerPulseDeliveries scopes to client_team with pulse rows only",
  () => {
    const plans = planCampaignerPulseDeliveries(
      SNAPSHOTS,
      [
        { campaigner_id: "cam1", client_id: "c1" },
        { campaigner_id: "cam1", client_id: "c2" },
        { campaigner_id: "cam2", client_id: "c3" },
        { campaigner_id: "cam2", client_id: "missing" },
      ],
      [
        { id: "cam1", full_name: "אביעד", phone: "972549757611" },
        { id: "cam2", full_name: "דנה", phone: "0501234567" },
        { id: "cam3", full_name: "ללא לקוחות", phone: "972521111111" },
      ],
    );
    assertStrictEquals(plans.length, 2);
    assertEquals(
      plans.find((p) => p.key === "campaigner:cam1")?.clientIds.sort(),
      ["c1", "c2"],
    );
    assertEquals(plans.find((p) => p.key === "campaigner:cam2")?.clientIds, [
      "c3",
    ]);
  },
);

Deno.test("planTeamManagerPulseDeliveries scopes by managed agencies", () => {
  const plans = planTeamManagerPulseDeliveries(SNAPSHOTS, [
    {
      user_id: "u1",
      full_name: "פליקס",
      phone: "972558833168",
      agency_ids: ["a1"],
    },
    {
      user_id: "u2",
      full_name: "מנהל ריק",
      phone: "972500000000",
      agency_ids: ["a9"],
    },
  ]);
  assertStrictEquals(plans.length, 1);
  assertStrictEquals(plans[0].name, "פליקס");
  assertEquals(plans[0].clientIds.sort(), ["c1", "c2"]);
});

Deno.test("mergePulseDeliveryPlans unions client ids for same phone", () => {
  const merged = mergePulseDeliveryPlans([
    {
      key: "campaigner:x",
      role: "campaigner",
      name: "אביעד",
      phone: "972549757611",
      clientIds: ["c1"],
    },
    {
      key: "manager:y",
      role: "team_manager",
      name: "אביעד מנהל",
      phone: "0549757611",
      clientIds: ["c2"],
    },
  ]);
  assertStrictEquals(merged.length, 1);
  assertStrictEquals(merged[0].role, "team_manager");
  assertEquals(merged[0].clientIds.sort(), ["c1", "c2"]);
});

Deno.test("planTeamManagerPulseDeliveries skips excluded recipients", () => {
  const plans = planTeamManagerPulseDeliveries(SNAPSHOTS, [
    {
      user_id: "u1",
      full_name: "אילנית",
      phone: "972500000001",
      agency_ids: ["a1"],
    },
    {
      user_id: "u2",
      full_name: "פליקס",
      phone: "972558833168",
      agency_ids: ["a1"],
    },
  ]);
  assertStrictEquals(plans.length, 1);
  assertStrictEquals(plans[0].name, "פליקס");
});

Deno.test(
  "planCampaignerPulseDeliveries includes David on DMM when configured",
  () => {
    const dmmPlans = planCampaignerPulseDeliveries(
      SNAPSHOTS,
      [{ campaigner_id: "cam-owner", client_id: "c1" }],
      [{ id: "cam-owner", full_name: "דוד", phone: "972507677613" }],
      "dmm",
    );
    assertStrictEquals(dmmPlans.length, 1);

    const mcPlans = planCampaignerPulseDeliveries(
      SNAPSHOTS,
      [{ campaigner_id: "cam-owner", client_id: "c1" }],
      [{ id: "cam-owner", full_name: "דוד", phone: "972507677613" }],
      "marketingcaptain",
    );
    assertStrictEquals(mcPlans.length, 1);
  },
);

Deno.test("preview message wraps scoped digest for campaigner", () => {
  const scoped = scopeSnapshotsForPlan(SNAPSHOTS, {
    key: "campaigner:cam1",
    role: "campaigner",
    name: "אביעד",
    phone: "972549757611",
    clientIds: ["c1", "c2"],
  });
  const digest = buildPulseWhatsAppDigest(
    scoped,
    "https://aios.co.il/t/dmm/dmm-dashboard",
  );
  const preview = buildPulsePreviewMessage("אביעד", digest);
  assertMatch(preview, /תצוגה מקדימה — בדיקת דופק לאביעד/);
  assertMatch(preview, /נבדקו 2 לקוחות/);
  assertMatch(preview, /https:\/\/aios\.co\.il\/t\/dmm\/dmm-dashboard/);
});

Deno.test(
  "findCampaignersMissingPulsePhone lists assigned campaigners without phone",
  () => {
    const missing = findCampaignersMissingPulsePhone(
      SNAPSHOTS,
      [
        { campaigner_id: "cam1", client_id: "c1" },
        { campaigner_id: "cam-no-phone", client_id: "c2" },
      ],
      [
        { id: "cam1", full_name: "אביעד", phone: "972549757611" },
        { id: "cam-no-phone", full_name: "רונית", phone: null },
        { id: "cam-idle", full_name: "ללא לקוחות", phone: null },
      ],
      "dmm",
    );
    assertStrictEquals(missing.length, 1);
    assertStrictEquals(missing[0].name, "רונית");
    assertStrictEquals(missing[0].clientCount, 1);
  },
);

Deno.test(
  "buildPulseMissingPhoneAlert asks manager to add campaigner phone",
  () => {
    const alert = buildPulseMissingPhoneAlert(
      [{ campaignerId: "cam-no-phone", name: "רונית", clientCount: 2 }],
      { tenantLabel: "dmm" },
    );
    assertMatch(alert, /חסר טלפון WhatsApp לקמפיינר/);
    assertMatch(alert, /• רונית \(2 לקוחות בדופק\)/);
    assertMatch(alert, /AIOS → צוות → קמפיינרים/);
    assertMatch(alert, /_dmm_/);
  },
);

Deno.test(
  "filterPulsePlansByCampaignerName keeps only matching campaigner plans",
  () => {
    const filtered = filterPulsePlansByCampaignerName(
      [
        {
          key: "campaigner:a",
          role: "campaigner",
          name: "שנאיה",
          phone: "972500000001",
          clientIds: ["c1"],
        },
        {
          key: "campaigner:b",
          role: "campaigner",
          name: "אביעד",
          phone: "972549757611",
          clientIds: ["c2"],
        },
      ],
      "שנאיה",
    );
    assertStrictEquals(filtered.length, 1);
    assertStrictEquals(filtered[0].name, "שנאיה");
  },
);
