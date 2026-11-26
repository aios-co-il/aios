/**
 * Each environment's real addresses, read from supabase/config.toml: the same file the
 * extension build takes the app address from. Test-only.
 */
import { parse } from "jsr:@std/toml@1";
import { isObject } from "../screen-context.ts";
import type { EnvironmentOrigins } from "./never-controllable.ts";

const CONFIG = new URL("../../../../config.toml", import.meta.url);

/** The remote in supabase/config.toml each environment runs on. */
const REMOTES = { production: "production", staging: "develop" } as const;

export type EnvironmentName = keyof typeof REMOTES;

/** The app address (Auth `site_url`) and the project's supabase.co address of one environment. */
export async function environmentOrigins(
  name: EnvironmentName,
): Promise<EnvironmentOrigins> {
  const config = parse(await Deno.readTextFile(CONFIG));
  const remote = valueAt(config, ["remotes", REMOTES[name]]);

  return {
    appOrigins: [text(valueAt(remote, ["auth", "site_url"]))],
    backendOrigins: [
      `https://${text(valueAt(remote, ["project_id"]))}.supabase.co`,
    ],
  };
}

/** An environment with no addresses of its own: only the fixed rules apply. */
export const NO_ORIGINS: EnvironmentOrigins = {
  appOrigins: [],
  backendOrigins: [],
};

/** Walks nested tables; a missing step gives undefined. */
function valueAt(table: unknown, path: Array<string>): unknown {
  return path.reduce<unknown>(
    (node, key) =>
      isObject(node) && key in node
        ? Object.getOwnPropertyDescriptor(node, key)?.value
        : undefined,
    table,
  );
}

/** A setting the test cannot run without. */
function text(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new Error("supabase/config.toml lacks an address this test reads");
  }
  return value;
}
