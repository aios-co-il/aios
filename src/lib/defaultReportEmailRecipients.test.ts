import { expect, test } from "vitest";
import {
  buildDefaultReportRecipientEmails,
  buildReportEmailOptions,
  DEFAULT_REPORT_EMAIL_RECIPIENTS,
} from "./defaultReportEmailRecipients.ts";

test("default recipients include Anna, David, DMM", () => {
  const emails = buildDefaultReportRecipientEmails(null);
  expect(emails).toStrictEqual([
    "adamchik2301@gmail.com",
    "david.castelnuovo@gmail.com",
    "dmm4business@gmail.com",
  ]);
});

test("default recipients append client email once", () => {
  const emails = buildDefaultReportRecipientEmails("Client@Example.com");
  expect(emails.length).toBe(4);
  expect(emails.includes("client@example.com")).toBeTruthy();
});

test("options list dedupes team member overlapping defaults", () => {
  const options = buildReportEmailOptions({
    clientEmail: "client@x.com",
    clientName: "לקוח",
    teamMembers: [
      {
        role_on_account: "seo",
        campaigners: { full_name: "Anna", email: "adamchik2301@gmail.com" },
      },
    ],
  });
  const emails = options.map((o) => o.email);
  expect(new Set(emails).size).toBe(emails.length);
  expect(emails.includes("client@x.com")).toBeTruthy();
  expect(DEFAULT_REPORT_EMAIL_RECIPIENTS.length).toBe(3);
});
