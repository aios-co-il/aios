import { describe, expect, it } from "vitest";
import { recipientSaveError } from "./recipientSaveError";

describe("recipientSaveError", () => {
  it("explains a client phone the guard refused", () => {
    expect(
      recipientSaveError(
        new Error(
          "carmen_report_recipients: +972500000099 is a client phone of this organization",
        ),
      ),
    ).toBe("המספר שייך ללקוח — כרמן לא מדווחת ללקוחות");
  });

  it("explains a user who is not staff of the organization", () => {
    expect(
      recipientSaveError(
        new Error(
          "carmen_report_recipients: user 1f0c is not staff of this organization",
        ),
      ),
    ).toBe("המשתמש אינו בצוות הארגון");
  });

  it("falls back to a generic message for any other failure", () => {
    expect(
      recipientSaveError(
        new Error(
          "carmen_report_recipients: only owners of this organization may change its recipients",
        ),
      ),
    ).toBe("שגיאה בשמירת נמען הדיווח");
  });
});
