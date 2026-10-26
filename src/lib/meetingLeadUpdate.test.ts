import { expect, test } from "vitest";
import {
  formatMeetingLeadUpdate,
  formatMeetingWhatsappMessage,
} from "./meetingLeadUpdate.ts";

test("lead update includes date, time, location and invitees", () => {
  const text = formatMeetingLeadUpdate({
    dateLabel: "25/08/2026",
    startTime: "10:00",
    endTime: "11:00",
    location: "זום",
    subject: "פגישה עם דוד",
    inviteeLabels: ["רותם", "דוד"],
  });
  expect(text).toBe(
    "נקבעה פגישה ל-25/08/2026 בשעה 10:00–11:00\nנושא: פגישה עם דוד\nמיקום: זום\nהוזמנו: רותם, דוד",
  );
});

test("whatsapp confirmation and same-day reminder", () => {
  expect(
    formatMeetingWhatsappMessage({
      contactName: "דוד",
      dateLabel: "25/08/2026",
      startTime: "10:00",
      endTime: "11:00",
      location: "זום",
      kind: "confirmation",
    }),
  ).toBe("היי דוד, נקבעה לך פגישה ל-25/08/2026 בשעה 10:00–11:00 (זום).");
  expect(
    formatMeetingWhatsappMessage({
      contactName: "דוד",
      dateLabel: "25/08/2026",
      startTime: "10:00",
      kind: "same_day",
    }),
  ).toBe("היי דוד, תזכורת: היום יש לך פגישה בשעה 10:00.");
});
