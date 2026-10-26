import { expect, test } from "vitest";
import { getLeadJsonIntakeFields } from "./leadJsonFields.ts";

test("JSON intake fields include campaign_name and stay aligned with webhook keys", () => {
  const fields = getLeadJsonIntakeFields("promo");
  const keys = fields.map((f) => f.key);

  expect(keys.includes("campaign_name")).toBeTruthy();
  expect(keys.includes("tenant_slug")).toBeTruthy();
  expect(keys.includes("company_name")).toBeTruthy();
  expect(keys.includes("source")).toBeTruthy();
  expect(fields.find((f) => f.key === "campaign_name")?.label).toBe("קמפיין");
  expect(fields.find((f) => f.key === "tenant_slug")?.exampleValue).toBe(
    "promo",
  );
  expect(fields.find((f) => f.key === "campaign_name")?.required).toBe(
    undefined,
  );
  expect(fields.find((f) => f.key === "agency_id")?.required).toBe(undefined);
  expect(fields.find((f) => f.key === "tenant_slug")?.required).toBe(true);
});
