import { describe, expect, it } from "vitest";
import { gatedPushes } from "./push-command.ts";

describe("gatedPushes", () => {
  it.each([
    "git push -u origin feature",
    "git push --force-with-lease origin HEAD:refs/heads/feature",
    "git -c core.quotepath=off push",
    "git --no-pager push origin feature",
    "GIT_TRACE=1 git push",
    "pnpm build && git push",
  ])("gates %s", (command) => {
    expect(gatedPushes(command, "/repo")).toHaveLength(1);
  });

  it.each([
    "git status",
    'git commit -m "gate git push"',
    "grep 'git push' docs/agents/releases.md",
    "echo git push",
    "git push origin --delete old-branch",
    "git push origin :old-branch",
    "git push --no-verify origin salvage",
  ])("leaves %s alone", (command) => {
    expect(gatedPushes(command, "/repo")).toStrictEqual([]);
  });

  it("checks the directory the push runs in", () => {
    expect(gatedPushes("cd other && git push", "/repo")).toStrictEqual([
      { cwd: "/repo/other" },
    ]);
    expect(gatedPushes("git -C /elsewhere push", "/repo")).toStrictEqual([
      { cwd: "/elsewhere" },
    ]);
  });
});
