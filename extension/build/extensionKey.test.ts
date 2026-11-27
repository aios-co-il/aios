import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { SUPABASE_REMOTE, valueAt } from "./environment.ts";
import { authRedirectUrl, EXTENSION_PUBLIC_KEYS } from "./extensionKey.ts";

const config: unknown = parse(
  readFileSync(resolve(__dirname, "../../supabase/config.toml"), "utf8"),
);

/** The Auth redirect list under this path of supabase/config.toml. */
function redirectList(path: Array<string>): Array<unknown> {
  const list = valueAt(config, [...path, "auth", "additional_redirect_urls"]);

  return Array.isArray(list) ? list : [];
}

describe("authRedirectUrl", () => {
  it("is the build's chromiumapp.org address under the sign-in path", () => {
    expect(authRedirectUrl("production")).toBe(
      "https://mcbbbameikghbbjfjgofafahfilhnhpb.chromiumapp.org/auth",
    );
    expect(authRedirectUrl("staging")).toBe(
      "https://cenboedhooldhjnjeaeifdakocglmbba.chromiumapp.org/auth",
    );
  });

  for (const name of Object.keys(EXTENSION_PUBLIC_KEYS) as Array<
    keyof typeof EXTENSION_PUBLIC_KEYS
  >) {
    it(`is allowed by the ${name} project's Auth redirect list`, () => {
      expect(redirectList(["remotes", SUPABASE_REMOTE[name]])).toContain(
        authRedirectUrl(name),
      );
    });
  }

  it("is in the base list too, which the develop remote repeats", () => {
    expect(redirectList([])).toContain(authRedirectUrl("staging"));
  });
});
