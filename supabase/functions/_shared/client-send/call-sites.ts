// The scan behind call-sites.test.ts (AIO-261): which edge files talk to a
// message provider directly, whether each one goes through the client send
// guard, and whether each call of a guarded sender names its sendKind. It
// reads source text and runs nothing.
import type { CallSiteLists } from "./call-site-allowlist.ts";
import { senderCalls } from "./call-site-stamps.ts";
import { maskSource } from "./source-mask.ts";

/** A source file, its path relative to supabase/functions. */
export type SourceFile = { path: string; text: string };

/** A provider call on one line; the patterns a scan looks for. */
export const PROVIDER_SEND_PATTERNS: Record<string, RegExp> = {
  green_api:
    /waInstance.*\/(sendMessage|sendFileByUrl|sendFileByUpload|sendPoll|sendLocation|sendContact|forwardMessages)\//,
  manus_gateway: /send\/(text|group|file|image|voice|audio|media|document)\b/,
  meta_cloud: /graph\.facebook\.com.*\/messages\b/,
  resend: /api\.resend\.com\/emails/,
  telegram:
    /api\.telegram\.org\/bot[^/\s]*\/send[A-Z]|\/bot\$\{[^}]+\}\/send[A-Z]/,
  manychat: /\/sending\/send(Content|Flow)|\/subscriber\/addTag/,
  gmail: /\/messages\/send\b/,
  calendar_invite: /sendUpdates["']?\s*[:=]\s*["']?all\b/,
};

/**
 * A direct call of the guard. An injected `deps.authorizeClientSend(` or a
 * typed signature `authorizeClientSend(request: …)` does not count: the
 * folder must also wire the real one.
 */
const GUARD_CALL = /(?<![.\w$])authorizeClientSend\((?!\s*[\w$]+\s*\??:)/;

export type CallSiteReport = {
  /** Provider files in none of the lists. */
  unlisted: string[];
  /** In-file senders whose guard call is missing or after the first send. */
  guardNotFirst: string[];
  /** Folder senders whose folder never calls the guard. */
  folderUnguarded: string[];
  /** Listed files that no longer call a provider: drop them. */
  staleListed: string[];
  /** Calls of a guarded sender that name no sendKind, as path:line. */
  unstampedCallers: string[];
  /** Listed unstamped callers whose every call now stamps: drop them. */
  staleUnstamped: string[];
};

/** Checks every file against the lists. */
export function checkCallSites(
  files: SourceFile[],
  lists: CallSiteLists,
): CallSiteReport {
  const senders = files.filter((file) => providerLines(file.text).length > 0);
  const senderPaths = new Set(senders.map((file) => file.path));
  const listed = new Set([
    ...Object.keys(lists.guarded),
    ...Object.keys(lists.personOnly),
    ...Object.keys(lists.bypasses),
  ]);
  const unstamped = files
    .map((file) => ({ path: file.path, lines: unstampedLines(file, lists) }))
    .filter((file) => file.lines.length > 0);
  const unstampedPaths = unstamped.map((file) => file.path);
  const knownUnstamped = Object.keys(lists.unstampedCallers);
  return {
    unlisted: [...senderPaths].filter((path) => !listed.has(path)),
    guardNotFirst: senders
      .filter((file) => lists.guarded[file.path] === "in_file")
      .filter((file) => !guardComesFirst(file.text))
      .map((file) => file.path),
    folderUnguarded: Object.entries(lists.guarded)
      .filter(
        ([path, check]) =>
          check !== "in_file" && !folderCallsGuard(files, folderOf(path)),
      )
      .map(([path]) => path),
    staleListed: [...listed].filter((path) => !senderPaths.has(path)),
    unstampedCallers: unstamped
      .filter((file) => !knownUnstamped.includes(file.path))
      .flatMap((file) => file.lines.map((line) => `${file.path}:${line}`)),
    staleUnstamped: knownUnstamped.filter(
      (path) => !unstampedPaths.includes(path),
    ),
  };
}

/** The 0-based lines that call a provider, comments left out. */
export function providerLines(text: string): number[] {
  return codeLines(text)
    .filter(([, line]) =>
      Object.values(PROVIDER_SEND_PATTERNS).some((re) => re.test(line)),
    )
    .map(([index]) => index);
}

/** Every .ts, .mjs and .js file under root that the scan reads. */
export async function readEdgeSources(root: URL): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for await (const path of walk(root, "")) {
    if (isScanned(path)) {
      files.push({ path, text: await Deno.readTextFile(new URL(path, root)) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** The guard call comes before the file's first provider call. */
function guardComesFirst(text: string): boolean {
  const guard = codeLines(text).find(([, line]) => GUARD_CALL.test(line));
  const firstSend = providerLines(text)[0];
  return guard !== undefined && guard[0] < firstSend;
}

/** Some file of the folder, tests and comments aside, calls the guard. */
function folderCallsGuard(files: SourceFile[], folder: string): boolean {
  return files.some(
    (file) =>
      folderOf(file.path) === folder &&
      GUARD_CALL.test(maskSource(file.text).plain),
  );
}

/**
 * The lines of the file's calls of a guarded sender (call-site-stamps.ts)
 * that name no sendKind. A sender's own folder is not a caller.
 */
function unstampedLines(file: SourceFile, lists: CallSiteLists): number[] {
  const senders = [...new Set(Object.keys(lists.guarded).map(folderOf))].filter(
    (name) => name !== folderOf(file.path),
  );
  return senderCalls(file.text, senders)
    .filter((call) => !call.stamped)
    .map((call) => call.line);
}

/** Lines with their 0-based index, without comment-only lines. */
function codeLines(text: string): [number, string][] {
  return text
    .split("\n")
    .map((line, index): [number, string] => [index, line])
    .filter(([, line]) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

/** The function folder of a path relative to supabase/functions. */
function folderOf(path: string): string {
  return path.split("/")[0];
}

/**
 * Tests and this folder hold provider URLs as fixtures, and the Staging-only
 * helpers send to allowlisted test numbers, so they stay out.
 */
function isScanned(path: string): boolean {
  return (
    /\.(ts|mjs|js)$/.test(path) &&
    !/\.test\.[a-z]+$/.test(path) &&
    !path.startsWith("_shared/client-send/") &&
    !path.startsWith("_shared/staging-") &&
    !path.endsWith("database.types.ts")
  );
}

/** Every file path under root, relative to it. */
async function* walk(root: URL, prefix: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(new URL(prefix || ".", root))) {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory) {
      yield* walk(root, `${path}/`);
    } else if (entry.isFile) {
      yield path;
    }
  }
}
