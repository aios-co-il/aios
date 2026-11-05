import { describe, expect, test } from "vitest";
import { nextVersion } from "./release-version.ts";

describe("nextVersion", () => {
  test("bumps each part and resets the lower ones", () => {
    expect(nextVersion("v1.4.2", "patch")).toBe("v1.4.3");
    expect(nextVersion("v1.4.2", "minor")).toBe("v1.5.0");
    expect(nextVersion("v1.4.2", "major")).toBe("v2.0.0");
  });

  test("starts at v0.1.0 when there is no release tag yet", () => {
    expect(nextVersion("", "patch")).toBe("v0.1.0");
  });

  test("rejects a tag that is not vX.Y.Z", () => {
    expect(() => nextVersion("release-3", "patch")).toThrow(
      'Latest tag "release-3" is not in the form vX.Y.Z',
    );
  });
});
