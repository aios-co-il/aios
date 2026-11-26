import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { parse } from "smol-toml";
import { loadEnv } from "vite";

export type EnvironmentName = "production" | "staging";

/** What one build of the extension is wired to. */
export type BuildEnvironment = {
  name: EnvironmentName;
  /** The address the extension calls. */
  supabaseUrl: string;
  /** Every address of that Supabase project the extension may reach: its host permissions. */
  supabaseOrigins: Array<string>;
  publishableKey: string;
  /** The web app the extension links to. */
  appOrigin: string;
};

type Backend = Pick<
  BuildEnvironment,
  "supabaseUrl" | "supabaseOrigins" | "publishableKey"
>;

type EnvValues = Record<string, string | undefined>;

const SUPABASE_URL = "VITE_SUPABASE_URL";
const PUBLISHABLE_KEY = "VITE_SUPABASE_PUBLISHABLE_KEY";

const EXTENSION_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = resolve(EXTENSION_DIR, "..");

// Named as a person finds them from the repository root, so an error says where to look.
const WEB_ENV = ".env";
const PRODUCTION_ENV = "extension/.env.production";
const SUPABASE_CONFIG = "supabase/config.toml";
const STAGING_SOURCE = "the build environment or extension/.env.staging.local";

/** The remote in supabase/config.toml that each environment runs on. */
const SUPABASE_REMOTE: Record<EnvironmentName, string> = {
  production: "production",
  staging: "develop",
};

/**
 * The values one build is made with. Each comes from the place the repo already keeps it,
 * and a missing or malformed one throws, which stops the build.
 */
export function resolveBuildEnvironment(mode: string): BuildEnvironment {
  const name = environmentName(mode);
  const backend =
    name === "production" ? productionBackend() : stagingBackend();

  return { name, ...backend, appOrigin: appOrigin(name) };
}

/** Vite's mode names the environment; any other mode has no values to build with. */
function environmentName(mode: string): EnvironmentName {
  if (mode === "production" || mode === "staging") {
    return mode;
  }
  throw new Error(
    `The extension builds for "production" or "staging", not "${mode}". Run "bun run build" or "bun run build:staging".`,
  );
}

/**
 * Production comes from tracked files only, never the shell or a local override, so the
 * build is the same on every machine. The web app's .env holds the project address and
 * the publishable key; the extension's file holds the custom API domain it calls.
 */
function productionBackend(): Backend {
  const web = readEnvFile(WEB_ENV);
  const extension = readEnvFile(PRODUCTION_ENV);
  const supabaseUrl = supabaseAddress(extension, PRODUCTION_ENV);
  const projectUrl = supabaseAddress(web, WEB_ENV);

  return {
    supabaseUrl,
    supabaseOrigins: [...new Set([supabaseUrl, projectUrl])],
    publishableKey: required(web, PUBLISHABLE_KEY, WEB_ENV),
  };
}

/**
 * Staging's address and key are kept outside git, so they come from the build environment
 * (CI) or an untracked local file. Nothing here falls back to Production.
 */
function stagingBackend(): Backend {
  const given = loadEnv("staging", EXTENSION_DIR, "VITE_");
  const supabaseUrl = supabaseAddress(given, STAGING_SOURCE);
  const publishableKey = required(given, PUBLISHABLE_KEY, STAGING_SOURCE);
  refuseProductionValues(supabaseUrl, publishableKey);

  return { supabaseUrl, supabaseOrigins: [supabaseUrl], publishableKey };
}

/** A shell that still holds Production's values must not produce a build labelled Staging. */
function refuseProductionValues(
  supabaseUrl: string,
  publishableKey: string,
): void {
  const production = productionBackend();

  if (
    production.supabaseOrigins.includes(supabaseUrl) ||
    production.publishableKey === publishableKey
  ) {
    throw new Error(
      `The Staging build was given Production's Supabase address or publishable key. Set ${SUPABASE_URL} and ${PUBLISHABLE_KEY} to AIOS Staging's values in ${STAGING_SOURCE}.`,
    );
  }
}

/** The web app's address: the Auth site_url of the environment's remote in supabase/config.toml. */
function appOrigin(name: EnvironmentName): string {
  const remote = SUPABASE_REMOTE[name];
  const setting = `[remotes.${remote}.auth] site_url in ${SUPABASE_CONFIG}`;
  const config = parse(
    readFileSync(resolve(REPO_ROOT, SUPABASE_CONFIG), "utf8"),
  );
  const siteUrl = valueAt(config, ["remotes", remote, "auth", "site_url"]);

  if (typeof siteUrl !== "string") {
    throw new Error(
      `${setting} is missing; it is the app address the extension links to.`,
    );
  }
  return httpsOrigin(siteUrl, setting);
}

/** The variables of one tracked env file, read without the shell's. */
function readEnvFile(file: string): EnvValues {
  return parseEnv(readFileSync(resolve(REPO_ROOT, file), "utf8"));
}

/** The Supabase address one source gives. */
function supabaseAddress(values: EnvValues, source: string): string {
  return httpsOrigin(
    required(values, SUPABASE_URL, source),
    `${SUPABASE_URL} in ${source}`,
  );
}

/** A value the build cannot do without. */
function required(values: EnvValues, name: string, source: string): string {
  const value = values[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing from ${source}. The extension is not built without it.`,
    );
  }
  return value;
}

/** The origin of an https address, so a trailing slash or path never reaches a request or a host permission. */
function httpsOrigin(value: string, setting: string): string {
  const url = URL.canParse(value) ? new URL(value) : null;

  if (url?.protocol !== "https:") {
    throw new Error(`${setting} must be an https address, got "${value}".`);
  }
  return url.origin;
}

/** Walks nested tables of parsed TOML; a missing step gives undefined. */
function valueAt(table: unknown, path: Array<string>): unknown {
  return path.reduce<unknown>(
    (node, key) => (isTable(node) ? node[key] : undefined),
    table,
  );
}

/** Narrows parsed TOML to a table. */
function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
