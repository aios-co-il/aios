import { assert, assertStrictEquals } from "jsr:@std/assert@1";

const runAiAgent = read("./index.ts");
const channelSend = read("../agent-channel-send/index.ts");

/** A handler's source, as text. */
function read(path: string): string {
  return Deno.readTextFileSync(new URL(path, import.meta.url));
}

// These steps read the handlers as text, as pulse-refresh-wiring.test.ts does: both are too
// large to run with fakes here (AIO-123). The block itself is tested in
// _shared/carmen/screen-context.test.ts.
Deno.test(
  "the browser tab reaches every brain in the user's turn",
  async (t) => {
    await t.step("Carmen's loop adds it to the user message it sends", () => {
      assert(
        runAiAgent.includes(
          "const userTurn = withBrowserTab(command_text, bodyJson.context_metadata);",
        ),
      );
      assert(runAiAgent.includes('{ role: "user", content: userTurn }'));
    });

    await t.step(
      "a Manus-engine agent gets it in the task it is handed",
      () => {
        const manusTask = runAiAgent.slice(
          runAiAgent.indexOf("const manusBody"),
          runAiAgent.indexOf("const manusRes"),
        );

        assert(manusTask.includes("prompt: userTurn,"));
        assertStrictEquals(manusTask.includes("command_text"), false);
      },
    );

    await t.step("the system prompt reads only the sidecar's context", () => {
      const systemMessage = runAiAgent.indexOf(
        '[{ role: "system", content: systemPrompt }];',
      );
      const beforeMessages = runAiAgent.slice(0, systemMessage);

      assert(systemMessage > 0);
      assertStrictEquals(beforeMessages.includes("withBrowserTab("), false);
      assertStrictEquals(
        beforeMessages.split("sidebarContextJson(").length - 1,
        1,
      );
      assert(
        beforeMessages.includes(
          "screenContext?.source === SCREEN_CONTEXT_SOURCE.commandCenterSidebar",
        ),
      );
    });

    await t.step("a dispatched brain gets it in the task text", () => {
      assert(channelSend.includes("content: withBrowserTab("));
      assert(
        channelSend.includes(
          'route.route_type === "model" ? null : body.context_metadata,',
        ),
      );
    });
  },
);
