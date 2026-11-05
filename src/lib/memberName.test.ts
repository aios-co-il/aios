import { describe, expect, it } from "vitest";
import {
  DELETED_MEMBER_NAME,
  formatMemberName,
  memberStatusOf,
} from "./memberName";

describe("formatMemberName", () => {
  const dana = { full_name: "Dana Levi", email: "dana@example.invalid" };

  it("shows an active member's name as it is", () => {
    expect(formatMemberName(dana)).toBe("Dana Levi");
  });

  it("marks a deleted member", () => {
    expect(formatMemberName(dana, "deleted")).toBe("Dana Levi (נמחק)");
  });

  it("marks an inactive member", () => {
    expect(formatMemberName(dana, "inactive")).toBe("Dana Levi (לא פעיל)");
  });

  it("falls back to the email, then to the fallback", () => {
    expect(
      formatMemberName({ full_name: " ", email: "x@example.invalid" }),
    ).toBe("x@example.invalid");
    expect(formatMemberName(null)).toBe("משתמש");
    expect(formatMemberName(undefined, undefined, "איש צוות")).toBe("איש צוות");
  });

  it("never shows a deleted member's anonymized email", () => {
    const deleted = { full_name: null, email: "deleted-1@deleted.invalid" };
    expect(formatMemberName(deleted, "deleted")).toBe(DELETED_MEMBER_NAME);
    expect(DELETED_MEMBER_NAME).toBe("משתמש שנמחק");
  });

  it("marks a writer whose profile is no longer readable", () => {
    expect(formatMemberName(null, "inactive")).toBe("משתמש (לא פעיל)");
  });
});

describe("memberStatusOf", () => {
  it("reads the two stored statuses and nothing else", () => {
    expect(memberStatusOf("inactive")).toBe("inactive");
    expect(memberStatusOf("deleted")).toBe("deleted");
    expect(memberStatusOf("active")).toBeUndefined();
    expect(memberStatusOf(null)).toBeUndefined();
  });
});
