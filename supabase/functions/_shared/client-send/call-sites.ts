// The scan behind call-sites.test.ts (AIO-261): which edge files talk to a
// message provider directly, and whether each one goes through the client
// send guard. It reads source text and runs nothing.
import type { CallSiteLists } from "./call-site-allowlist.ts";

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

const GUARD_CALL = /\bauthorizeClientSend\(/;

export type CallSiteReport = {
  /** Provider files in none of the lists. */
  unlisted: string[];
  /** In-file senders whose guard call is missing or after the first send. */
  guardNotFirst: string[];
  /** Folder senders whose folder never calls the guard. */
  folderUnguarded: string[];
  /** Listed files that no longer call a provider: drop them. */
  staleListed: string[];
  /** Callers of a guarded sender that never name a sendKind. */
  unstampedCallers: string[];
  /** Listed unstamped callers that now stamp, or no longer call: drop them. */
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
    .filter((file) => callsGuardedSender(file, lists))
    .filter((file) => !file.text.includes("sendKind"))
    .map((file) => file.path);
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
    unstampedCallers: unstamped.filter(
      (path) => !knownUnstamped.includes(path),
    ),
    staleUnstamped: knownUnstamped.filter((path) => !unstamped.includes(path)),
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

/** Some file of the folder, tests aside, calls the guard. */
function folderCallsGuard(files: SourceFile[], folder: string): boolean {
  return files.some(
    (file) => folderOf(file.path) === folder && GUARD_CALL.test(file.text),
  );
}

/**
 * A literal functions/v1/<sender> URL, or a sender's quoted name in a file
 * that builds functions/v1/${…} URLs. A sender's own folder is not a caller.
 */
function callsGuardedSender(file: SourceFile, lists: CallSiteLists): boolean {
  const builds = file.text.includes("functions/v1/${");
  return Object.keys(lists.guarded).some((path) => {
    const name = folderOf(path);
    if (folderOf(file.path) === name) {
      return false;
    }
    return (
      file.text.includes(`functions/v1/${name}`) ||
      (builds && new RegExp(`["'\`]${name}["'\`]`).test(file.text))
    );
  });
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
