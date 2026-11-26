import { describe, expect, it } from "vitest";
import { extensionOriginsIn, wholeSitePolicy } from "./frameAncestors";

const EXTENSION = `chrome-extension://${"a".repeat(32)}`;
const POLICY = {
  key: "Content-Security-Policy",
  value: `frame-ancestors 'self' ${EXTENSION} https://x`,
};

describe("frameAncestors", () => {
  it("reads the policy of the whole-site rule only", () => {
    expect(wholeSitePolicy([{ source: "/(.*)", headers: [POLICY] }])).toBe(
      POLICY.value,
    );
    expect(
      wholeSitePolicy([{ source: "/assets/(.*)", headers: [POLICY] }]),
    ).toBeUndefined();
    expect(wholeSitePolicy([])).toBeUndefined();
    expect(wholeSitePolicy(undefined)).toBeUndefined();
  });

  it("names the extension origins of a policy, and nothing else in it", () => {
    expect(extensionOriginsIn(POLICY.value)).toEqual([EXTENSION]);
    expect(extensionOriginsIn("frame-ancestors 'self'")).toEqual([]);
    expect(extensionOriginsIn(undefined)).toEqual([]);
  });

  it("an origin named by a rule for other paths is not trusted", () => {
    const rules = [
      { source: "/(.*)", headers: [{ ...POLICY, value: "frame-ancestors" }] },
      { source: "/embed/(.*)", headers: [POLICY] },
    ];

    expect(extensionOriginsIn(wholeSitePolicy(rules))).toEqual([]);
  });
});
