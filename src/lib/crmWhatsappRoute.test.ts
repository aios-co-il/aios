import { expect, test } from "vitest";
import {
  crmWhatsappFunctionName,
  pickCrmWhatsappIntegration,
} from "./crmWhatsappRoute.ts";

const green = { id: "g1", integration_type: "green_api", user_id: "u1" };
const manus = { id: "m1", integration_type: "manus_wa", user_id: "u2" };
const meta = { id: "x1", integration_type: "meta_whatsapp", user_id: null };

test("prefers the lead's active CRM WhatsApp provider", () => {
  const picked = pickCrmWhatsappIntegration("manus_wa", [green, manus, meta]);
  expect(picked?.id).toBe("m1");
  expect(picked?.type).toBe("manus_wa");
});

test("falls back to green_api then manus then meta", () => {
  expect(pickCrmWhatsappIntegration(null, [meta, manus, green])?.type).toBe(
    "green_api",
  );
  expect(pickCrmWhatsappIntegration(null, [meta, manus])?.type).toBe(
    "manus_wa",
  );
  expect(pickCrmWhatsappIntegration("telegram", [meta])?.type).toBe(
    "meta_whatsapp",
  );
});

test("maps provider to the CRM send function", () => {
  expect(crmWhatsappFunctionName("green_api")).toBe("send-green-api-message");
  expect(crmWhatsappFunctionName("manus_wa")).toBe("send-manus-wa-message");
  expect(crmWhatsappFunctionName("meta_whatsapp")).toBe(
    "send-meta-whatsapp-message",
  );
});
