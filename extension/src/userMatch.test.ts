import { describe, expect, it } from "vitest";
import { otherUserNotice } from "./userMatch";

const SITE_USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

describe("otherUserNotice", () => {
  it("names the extension's user when the site is signed in as someone else", () => {
    expect(
      otherUserNotice(SITE_USER, { id: OTHER_USER, email: "admin@aios.test" }),
    ).toBe(
      "התוסף מחובר כמשתמש אחר: admin@aios.test. התחבר באותו משתמש כמו באתר.",
    );
  });

  it("falls back to the id for a user with no email", () => {
    expect(otherUserNotice(SITE_USER, { id: OTHER_USER })).toContain(
      OTHER_USER,
    );
  });

  it("says nothing for the same user, a signed-out extension or a site that did not say", () => {
    expect(otherUserNotice(SITE_USER, { id: SITE_USER })).toBeNull();
    expect(otherUserNotice(SITE_USER, null)).toBeNull();
    expect(otherUserNotice(undefined, { id: OTHER_USER })).toBeNull();
  });
});
