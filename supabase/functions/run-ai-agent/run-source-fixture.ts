/** Reads an owning run module with state bindings reduced for legacy source guards. */
export function readRunSource(file: string): string {
  return Deno.readTextFileSync(new URL(`./run/${file}.ts`, import.meta.url))
    .replaceAll("run.input.", "")
    .replaceAll("run.dependencies.", "")
    .replaceAll("run.", "")
    .replaceAll("tools.pulseDigestShortcut", "pulseDigestShortcut")
    .replace(/\b(\w+): \1\b/g, "$1");
}

/** Composes owning modules in the same sequence the run orchestrator executes. */
export function readRunStages(): string {
  const source = Deno.readTextFileSync(
    new URL("./run/agent.ts", import.meta.url),
  );
  const owners = new Map(
    [...source.matchAll(/import \{ (\w+) \} from "\.\/(.+)\.ts";/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
  const stages =
    source
      .match(/const stages = \[([\s\S]*?)\];/)?.[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean) || [];
  const nested: Record<string, Array<string>> = {
    buildRunBasePrompt: [
      "build-v2-run-prompt",
      "initialize-v1-run-prompt",
      "append-v1-task-prompts",
      "append-v1-agent-specialties",
      "append-v1-procedural-skills",
      "append-v1-presentation",
      "append-v1-recall-and-lead",
    ],
    runModelLoop: [
      "load-provider-chain",
      "model-round-payload",
      "request-model-round",
      "execute-model-tool",
      "process-model-tool-result",
    ],
  };
  return stages
    .flatMap((name) => {
      const owner = owners.get(name);
      if (!owner) {
        throw new Error(`Missing source owner for ${name}`);
      }
      return [readRunSource(owner), ...(nested[name] || []).map(readRunSource)];
    })
    .join("\n");
}
