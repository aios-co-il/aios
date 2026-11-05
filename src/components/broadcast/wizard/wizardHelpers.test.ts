import { describe, expect, it } from "vitest";
import { emailBodyHasContent, wizardSender } from "./wizardHelpers";

describe("emailBodyHasContent", () => {
  it("treats an empty editor as empty and an image as content", () => {
    expect(emailBodyHasContent("<p></p>")).toBe(false);
    expect(emailBodyHasContent("<p>&nbsp;</p>")).toBe(false);
    expect(emailBodyHasContent('<p><img src="x.png"></p>')).toBe(true);
    expect(emailBodyHasContent("<p>שלום</p>")).toBe(true);
  });
});

describe("wizardSender", () => {
  const defaultDomain = {
    id: "d1",
    tenant_id: "t1",
    domain: "aios.co.il",
    default_local: "pd.psagot",
    from_name: "פ.ד",
    is_default: true,
    created_at: "",
  };
  const base = {
    fromLocal: "info",
    fromDomain: "aios.co.il",
    fromName: " ",
    defaultDomain,
  };

  it("uses the tenant default unless a custom address is chosen", () => {
    expect(wizardSender({ ...base, custom: false })).toEqual({
      email: "pd.psagot@aios.co.il",
      name: "פ.ד",
    });
    expect(wizardSender({ ...base, custom: true })).toEqual({
      email: "info@aios.co.il",
      name: null,
    });
  });

  it("has no sender without a domain", () => {
    expect(
      wizardSender({ ...base, custom: false, defaultDomain: undefined }),
    ).toEqual({ email: null, name: null });
  });
});
