import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { toastReportSent } from "./toastReportSent";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
});

describe("toastReportSent", () => {
  it("confirms a report that went out with its image", () => {
    toastReportSent({ deliveredAs: "media" }, "הדוח נשלח בוואטסאפ בהצלחה");
    expect(toast.success).toHaveBeenCalledWith("הדוח נשלח בוואטסאפ בהצלחה");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("says when only the message and link reached the group", () => {
    toastReportSent({ deliveredAs: "text_fallback" }, "הדוח נשלח");
    expect(toast.warning).toHaveBeenCalledWith(
      "הקבוצה לא קיבלה את התמונה, ולכן נשלחו רק ההודעה והקישור",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
