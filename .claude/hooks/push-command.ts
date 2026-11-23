import { resolve } from "node:path";

/** A `git push` found in a Bash command, and the directory it runs in. */
export type GatedPush = { cwd: string };

/**
 * The `git push` calls of a Bash command that send commits, each with the
 * directory it runs in (after `cd` or `-C`). Quoted text is not a command,
 * so a message that mentions a push is not one; deleting a remote branch and
 * `--no-verify` are left alone.
 */
export function gatedPushes(command: string, cwd: string): Array<GatedPush> {
  const pushes: Array<GatedPush> = [];
  let dir = cwd;
  for (const segment of unquoted(command).split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    if (words[0] === "cd" && words[1]) {
      dir = resolve(dir, words[1]);
      continue;
    }
    const push = pushOf(words, dir);
    if (push) {
      pushes.push(push);
    }
  }
  return pushes;
}

/** The push a command's words run, when they are a `git push` that sends commits. */
function pushOf(words: Array<string>, cwd: string): GatedPush | null {
  const start = words.findIndex((word) => !/^\w+=/.test(word));
  if (start < 0 || words[start] !== "git") {
    return null;
  }
  let dir = cwd;
  let index = start + 1;
  while (words[index]?.startsWith("-")) {
    const option = words[index];
    if (option === "-C" && words[index + 1]) {
      dir = resolve(dir, words[index + 1]);
    }
    index += option === "-C" || option === "-c" ? 2 : 1;
  }
  if (words[index] !== "push") {
    return null;
  }
  const args = words.slice(index + 1);
  const sendsNothing = args.some(
    (arg) =>
      ["--delete", "-d", "--no-verify"].includes(arg) || arg.startsWith(":"),
  );
  return sendsNothing ? null : { cwd: dir };
}

/** The command with quoted text blanked out, so words inside quotes are not commands. */
function unquoted(command: string): string {
  return command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""');
}
