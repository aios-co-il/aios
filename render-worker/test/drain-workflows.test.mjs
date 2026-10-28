import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The two GitHub drains (.github/workflows/render-worker.yml for Staging and
 * render-worker-preview.yml for each PR's Supabase preview) hold an account token that can
 * read every project's keys, Production's included.
 */
const WORKFLOWS = ["render-worker.yml", "render-worker-preview.yml"];

const workflow = (name) =>
  readFileSync(
    new URL(`../../.github/workflows/${name}`, import.meta.url),
    "utf8",
  );

const indentOf = (line) => line.match(/^ */)[0].length;

/** The job's steps in order, each with its name, `if:` and the script it runs. */
function steps(text) {
  const body = text.split(/^ {4}steps:\n/m)[1];
  return body
    .split(/^ {6}- /m)
    .slice(1)
    .map((chunk) => ({
      text: chunk,
      name:
        chunk.match(/^\s*name: (.+)$/m)?.[1] ??
        chunk.match(/^\s*uses: (.+)$/m)?.[1],
      id: chunk.match(/^\s*id: (.+)$/m)?.[1],
      if: chunk.match(/^\s*if: (.+)$/m)?.[1] ?? "",
      run: script(chunk),
    }));
}

/** A step's `run:` script, de-indented the way YAML reads a block scalar. */
function script(chunk) {
  const lines = chunk.split("\n");
  const at = lines.findIndex((line) => /^\s*run: /.test(line));
  if (at < 0) return "";
  const inline = lines[at].replace(/^\s*run: /, "");
  if (inline !== "|") return inline;
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() && indentOf(line) <= indentOf(lines[at])) break;
    body.push(line);
  }
  const pad = Math.min(
    ...body.filter((line) => line.trim()).map((line) => indentOf(line)),
  );
  return body.map((line) => line.slice(pad)).join("\n");
}

const usesToken = (step) => step.text.includes("secrets.BASE_ACCESS_TOKEN");
/** Checks out or runs the branch's code, or a dependency's. */
const runsBranchCode = (step) =>
  /actions\/checkout/.test(step.text) ||
  /working-directory:/.test(step.text) ||
  /\b(npm|npx|node|pnpm)\b/.test(step.run);

test.each(WORKFLOWS)(
  "%s uses the account token before any branch code or dependency runs",
  (name) => {
    const text = workflow(name);
    const all = steps(text);
    const lastToken = all.findLastIndex(usesToken);
    const firstBranch = all.findIndex(runsBranchCode);
    expect(lastToken).toBeGreaterThanOrEqual(0);
    expect(firstBranch).toBeGreaterThan(lastToken);
    // The job's GITHUB_TOKEN can only read the repository.
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
    // The lockfile pins every dependency, and no install script runs.
    const installs = all.filter((step) => /\bnpm\b/.test(step.run));
    expect(installs.length).toBeGreaterThan(0);
    for (const step of installs)
      expect(step.run).toMatch(/^npm ci --ignore-scripts /);
  },
);

/** Runs a step's script with bash; curl is a fake that records its arguments and answers reply. */
function runWithFakeCurl(step, reply, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "drain-step-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(dir, "reply"), reply);
  writeFileSync(
    join(bin, "curl"),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${dir}/args"\ncat "${dir}/reply"\n`,
  );
  chmodSync(join(bin, "curl"), 0o755);
  const output = join(dir, "output");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GITHUB_OUTPUT: output,
      ...env,
    },
  });
  let args = [];
  try {
    args = readFileSync(join(dir, "args"), "utf8").split("\n");
  } catch {
    // curl was not called.
  }
  return { status: result.status, output: readFileSync(output, "utf8"), args };
}

test("the Staging drain installs nothing while no run is waiting", () => {
  const all = steps(workflow("render-worker.yml"));
  const at = all.findIndex((step) => step.id === "queue");
  expect(at).toBeGreaterThan(0);
  // Only the key is resolved before the probe; every later step waits for it.
  expect(all.slice(0, at).every(usesToken)).toBe(true);
  for (const step of all.slice(at + 1))
    expect(step.if).toBe("steps.queue.outputs.work == 'true'");

  const env = {
    SUPABASE_URL: "https://staging.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  };
  const idle = runWithFakeCurl(all[at], "[]", env);
  expect(idle.status).toBe(0);
  expect(idle.output).toBe("work=false\n");
  const busy = runWithFakeCurl(all[at], '[{"id":"run-1"}]', env);
  expect(busy.status).toBe(0);
  expect(busy.output).toBe("work=true\n");

  // One request for what claim_video_run takes: a queued video run, or one left running
  // for 45 minutes by a worker that stopped.
  expect(busy.args).toContain("https://staging.example/rest/v1/marketing_runs");
  expect(busy.args).toContain("apikey: service-key");
  expect(busy.args).toContain("kind=not.is.null");
  expect(busy.args).toContain("limit=1");
  const or = busy.args.find((arg) => arg.startsWith("or="));
  const stale = or?.match(
    /^or=\(status\.eq\.queued,and\(status\.eq\.running,started_at\.lt\.(\S+Z)\)\)$/,
  )?.[1];
  expect(stale).toBeTruthy();
  const minutesAgo = (Date.now() - Date.parse(stale)) / 60_000;
  expect(minutesAgo).toBeGreaterThan(44);
  expect(minutesAgo).toBeLessThan(46.5);
});

test("a branch without a Supabase preview installs nothing", () => {
  const all = steps(workflow("render-worker-preview.yml"));
  const at = all.findIndex((step) => step.id === "preview");
  expect(at).toBe(0);
  for (const step of all.slice(at + 1))
    expect(step.if).toBe("steps.preview.outputs.ref != ''");
});

test("a preview is looked up only under the Production project", () => {
  const resolve = steps(workflow("render-worker-preview.yml")).find(
    (step) => step.id === "preview",
  );
  // Every request fails at once, so a lookup across all the token's projects crashes here.
  const offline = "http://127.0.0.1:9";
  const unset = runWithFakeCurl(resolve, "", {
    GIT_BRANCH: "feature/film",
    PARENT_REF: "",
    SUPABASE_ACCESS_TOKEN: "account-token",
    https_proxy: offline,
    HTTPS_PROXY: offline,
    no_proxy: "",
    NO_PROXY: "",
  });
  expect(unset.status).toBe(0);
  expect(unset.output).toBe("ref=\n");
});
