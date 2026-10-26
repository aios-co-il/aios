import { expect, test } from "vitest";
import {
  autoDetectLeadImportField,
  classifyLeadImportStatus,
  inferLeadSource,
  leadArrivalSourceChanged,
  leadCreatedAtWasBumped,
  leadFirstSourceDisplay,
  leadOriginTagNames,
  leadSourceDisplay,
  leadSourceFieldLabel,
  looksLikePipelineStatusLabel,
  looksLikeResponseStatusLabel,
  resolveResponseStatusKey,
  responseStatusSelectValue,
  unmatchedResponseStatusValue,
} from "./leadFields.ts";

const defaultStatuses = [
  { status_key: "no_answer_1", label: "אין מענה 1", color: "#fbbf24" },
  { status_key: "no_answer_2", label: "אין מענה 2", color: "#f97316" },
  { status_key: "in_progress", label: "בעבודה", color: "#3b82f6" },
  { status_key: "not_relevant", label: "לא רלוונטי", color: "#6b7280" },
];

test("inferLeadSource keeps known enums and maps Hebrew sources", () => {
  expect(inferLeadSource("website")).toBe("website");
  expect(inferLeadSource("פייסבוק")).toBe("paid_ads");
  expect(inferLeadSource("FB")).toBe("paid_ads");
  expect(inferLeadSource("הפניה של לקוח")).toBe("referral");
  expect(inferLeadSource("רימרקטינג קיץ 2026")).toBe("other");
});

test("leadSourceDisplay shows the channel, not the campaign name", () => {
  expect(
    leadSourceDisplay({ campaign_name: "שיווק", source: "paid_ads" }),
  ).toBe("FB");
  expect(
    leadSourceDisplay({ campaign_name: "Promo Q3", source: "website" }),
  ).toBe("אתר");
  expect(leadSourceDisplay({ source: "other" })).toBe("אחר");
  expect(leadSourceDisplay({ source: "facebook" })).toBe("FB");
});

test("repeat inbound keeps the first created_at and first source", () => {
  expect(
    leadCreatedAtWasBumped({
      created_at: "2026-08-25T15:00:00.000Z",
      first_created_at: "2026-04-15T00:00:00.000Z",
    }),
  ).toBe(true);
  expect(
    leadCreatedAtWasBumped({
      created_at: "2026-04-15T00:00:00.000Z",
      first_created_at: "2026-04-15T00:00:00.000Z",
    }),
  ).toBe(false);
  expect(
    leadArrivalSourceChanged({ source: "whatsapp", first_source: "paid_ads" }),
  ).toBe(true);
  expect(
    leadArrivalSourceChanged({ source: "paid_ads", first_source: "paid_ads" }),
  ).toBe(false);
  expect(
    leadSourceFieldLabel({ source: "whatsapp", first_source: "paid_ads" }),
  ).toBe("מקור הגעה מעודכן");
  expect(leadFirstSourceDisplay({ first_source: "paid_ads" })).toBe("FB");
});

test("leadOriginTagNames creates campaign and source tags without duplicating אחר", () => {
  expect(
    leadOriginTagNames({ campaign_name: "שיווק", source: "paid_ads" }),
  ).toStrictEqual(["שיווק", "FB"]);
  expect(
    leadOriginTagNames({ campaign_name: "  מכירות  ", source: "website" }),
  ).toStrictEqual(["מכירות", "אתר"]);
  expect(
    leadOriginTagNames({ campaign_name: "FB", source: "paid_ads" }),
  ).toStrictEqual(["FB"]);
  expect(
    leadOriginTagNames({ campaign_name: "סושיאל", source: "other" }),
  ).toStrictEqual(["סושיאל"]);
  expect(
    leadOriginTagNames({ campaign_name: "   ", source: "other" }),
  ).toStrictEqual([]);
  expect(leadOriginTagNames({ source: "referral" })).toStrictEqual(["הפניה"]);
  expect(leadOriginTagNames(null)).toStrictEqual([]);
});

test("ללא מענה and אין מענה resolve to no_answer_1", () => {
  expect(resolveResponseStatusKey("ללא מענה", defaultStatuses)).toBe(
    "no_answer_1",
  );
  expect(resolveResponseStatusKey("לא ענה", defaultStatuses)).toBe(
    "no_answer_1",
  );
  expect(resolveResponseStatusKey("אין מענה", defaultStatuses)).toBe(
    "no_answer_1",
  );
  expect(resolveResponseStatusKey("אין עמנה", defaultStatuses)).toBe(
    "no_answer_1",
  );
  expect(resolveResponseStatusKey("אין מענה 2", defaultStatuses)).toBe(
    "no_answer_2",
  );
  expect(resolveResponseStatusKey("no_answer_1", defaultStatuses)).toBe(
    "no_answer_1",
  );
  expect(resolveResponseStatusKey("אין מענה 1", defaultStatuses)).toBe(
    "no_answer_1",
  );
});

test("typos of לא רלוונטי resolve to not_relevant", () => {
  expect(resolveResponseStatusKey("לא רלוונטי", defaultStatuses)).toBe(
    "not_relevant",
  );
  expect(resolveResponseStatusKey("לא לרוונטי", defaultStatuses)).toBe(
    "not_relevant",
  );
  expect(resolveResponseStatusKey("לא רלווטני", defaultStatuses)).toBe(
    "not_relevant",
  );
});

test("response status select keeps unmatched raw values visible", () => {
  expect(responseStatusSelectValue("ללא מענה", defaultStatuses)).toBe(
    "no_answer_1",
  );
  expect(responseStatusSelectValue("custom_hot", defaultStatuses)).toBe(
    "custom_hot",
  );
  expect(responseStatusSelectValue(null, defaultStatuses)).toBe("none");
});

test("status column named סטטוס remaps to response_status only when purely secondary", () => {
  expect(autoDetectLeadImportField("שם הקמפיין")).toBe("campaign_name");
  expect(autoDetectLeadImportField("קמפיין")).toBe("campaign_name");
  expect(autoDetectLeadImportField("סטטוס משני")).toBe("response_status");
  expect(
    autoDetectLeadImportField("סטטוס", ["ללא מענה", "ללא מענה", "אין מענה 2"]),
  ).toBe("response_status");
  expect(autoDetectLeadImportField("סטטוס", ["חדש", "נסגר", "הצעה"])).toBe(
    "status",
  );
  expect(
    autoDetectLeadImportField("סטטוס", [
      "אין מענה",
      "נקבעה פגישה",
      "הצעת מחיר",
    ]),
  ).toBe("status");
});

test("looksLikeResponseStatusLabel covers common Hebrew secondary statuses", () => {
  expect(looksLikeResponseStatusLabel("ללא מענה")).toBe(true);
  expect(looksLikeResponseStatusLabel("תפוס")).toBe(true);
  expect(looksLikeResponseStatusLabel("חדש")).toBe(false);
  expect(looksLikePipelineStatusLabel("נקבעה פגישה")).toBe(true);
  expect(looksLikePipelineStatusLabel("אין מענה")).toBe(false);
});

test("classifyLeadImportStatus splits pipeline stages from secondary statuses", () => {
  expect(classifyLeadImportStatus("אין מענה", defaultStatuses)).toStrictEqual({
    pipelineStatus: null,
    responseStatus: "no_answer_1",
  });
  expect(
    classifyLeadImportStatus("נקבעה פגישה", defaultStatuses),
  ).toStrictEqual({
    pipelineStatus: "meeting_scheduled",
    responseStatus: null,
  });
  expect(classifyLeadImportStatus("הצעת מחיר", defaultStatuses)).toStrictEqual({
    pipelineStatus: "proposal_sent",
    responseStatus: null,
  });
  expect(classifyLeadImportStatus("לא רלוונטי", defaultStatuses)).toStrictEqual(
    {
      pipelineStatus: null,
      responseStatus: "not_relevant",
    },
  );
  expect(
    classifyLeadImportStatus("ממתין להחלטה", defaultStatuses),
  ).toStrictEqual({
    pipelineStatus: "negotiation",
    responseStatus: null,
  });
});

test("unmatchedResponseStatusValue only returns values that are not in the status list", () => {
  expect(unmatchedResponseStatusValue("ללא מענה", defaultStatuses)).toBe(null);
  expect(unmatchedResponseStatusValue("custom_hot", defaultStatuses)).toBe(
    "custom_hot",
  );
});
