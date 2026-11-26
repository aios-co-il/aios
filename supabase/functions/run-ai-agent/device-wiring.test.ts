import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { DIRECT_BLOCKED_TOOLS } from "../_shared/carmen-direct-tools.mjs";
import {
  DEVICE_TOOL_NAMES,
  isDeviceToolName,
} from "../_shared/carmen/device/contract.ts";
import { ALL_TOOLS } from "./tool-catalog.ts";

const runAiAgent = Deno.readTextFileSync(
  new URL("./index.ts", import.meta.url),
);

/** Where a piece of index.ts starts; fails when it is missing. */
function at(text: string, from = 0): number {
  const index = runAiAgent.indexOf(text, from);
  assert(index >= 0, `index.ts lacks: ${text}`);
  return index;
}

// These steps read index.ts as text, as browser-tab-wiring.test.ts does: handleRunAgent is
// too large to run with fakes here (AIO-123). The device side itself is tested with fakes in
// device-turn/.
Deno.test("run-ai-agent wires the device steps (AIO-686)", async (t) => {
  await t.step("a continuation never creates a conversation", () => {
    assert(
      runAiAgent.includes(
        "if (!serverConversationId && !deviceRequestOf(bodyJson).continuation) {",
      ),
    );
  });

  await t.step(
    "the device turn opens after the conversation and before every shortcut",
    () => {
      const opened = at(
        "const deviceTurn = await openDeviceTurn(supabase, emit, {",
      );

      assert(
        opened >
          at('emit({ type: "conversation_id", id: serverConversationId });'),
      );
      assert(opened < at("fastLaneFits({"));
      assert(opened < at("// ─── 2.7. Code-level instruction capture"));
      assert(
        at("if (deviceTurn.reply) {\n      return deviceTurn.reply;\n    }") >
          opened,
      );
      assert(
        runAiAgent
          .slice(at("fastLaneFits({"), at("const fastReply"))
          .includes("deviceTurn.continuing ||"),
      );
    },
  );

  await t.step(
    "tools are withheld and offered after every tool source, before the messages",
    () => {
      const withheld = at(
        "filteredTools = deviceTurn.withoutWithheld(filteredTools);",
      );
      const offered = at("expandAgentTools(deviceTurn.offeredTools);");

      assert(withheld > runAiAgent.lastIndexOf("missingEnabledTools("));
      assert(withheld > at("exposedMcpTools.push(t as any);"));
      assert(
        runAiAgent
          .slice(withheld, offered)
          .includes("...deviceTurn.withoutWithheld(exposedMcpTools),"),
      );
      assert(offered < at('[{ role: "system", content: systemPrompt }];'));
    },
  );

  await t.step(
    "the dispatch answers a device or withheld tool before any other executor",
    () => {
      const branch = at(
        "} else if (deviceTurn.handles(toolName)) {\n            result = await deviceTurn.call(toolName, toolArgs);",
      );

      assert(branch > at("result = workshopRefusal;"));
      assert(branch < at('} else if (toolName === "search_agent_tools") {'));
      assert(branch < at("} else if (mcpExecutors.has(toolName)) {"));
      assert(
        branch < at("result = await executeTool(\n              toolName,"),
      );
    },
  );

  await t.step(
    "the step is read from the tool's result, never from tool_call, and ends the turn",
    () => {
      const read = at("deviceAction = deviceActionOf(result);");
      const pause = at(
        "if (deviceAction) {\n        finalOutput = devicePauseAnswer(msg.content);\n        emitText(finalOutput);\n        break;\n      }",
      );

      assert(
        read >
          at('emit({ type: "tool_call", tool: toolName, args: toolArgs });'),
      );
      assert(
        read > at("toolLog.push({ tool: toolName, args: toolArgs, result });"),
      );
      assert(
        runAiAgent
          .slice(read, pause)
          .includes(
            'emit?.({ type: "device_action", ...deviceAction });\n          break;',
          ),
      );
      assert(pause > at("messages.push(...toolResults);"));
      // Before the filler: a paused turn always has an answer, so fallbackReply never runs.
      assert(pause < at("const fallback = fallbackReply(toolLog, {"));
    },
  );

  await t.step("a continuation saves its answer only", () => {
    assert(
      runAiAgent.includes(
        "message: deviceTurn.continuing ? null : String(command_text),",
      ),
    );
    assert(
      runAiAgent.includes(
        '...(turn.message === null ? [] : [{ role: "user", content: turn.message }]),',
      ),
    );
  });

  await t.step("both replies tell the site a step is waiting", () => {
    assert(
      runAiAgent.includes(
        "conversation_id: serverConversationId,\n        device_action: deviceAction,",
      ),
    );
    assert(
      runAiAgent.includes(
        "error: final.error,\n            device_action: final.device_action,",
      ),
    );
  });

  await t.step("the resumed step joins the user turn only", () => {
    assert(
      runAiAgent.includes(
        "const userTurn = deviceTurn.userTurn(\n      withBrowserTab(command_text, bodyJson.context_metadata),\n    );",
      ),
    );
    const systemMessage = at('[{ role: "system", content: systemPrompt }];');

    assertStrictEquals(
      runAiAgent.slice(0, systemMessage).includes("deviceTurn.userTurn("),
      false,
    );
  });
});

Deno.test(
  "no device tool can be reached outside the device turn",
  async (t) => {
    await t.step(
      "none is in Carmen's catalogue, so no search, skin or direct pool offers it",
      () => {
        assertEquals(
          ALL_TOOLS.filter((tool) => isDeviceToolName(tool.name)),
          [],
        );
      },
    );

    await t.step("every one is blocked for direct callers", () => {
      for (const name of DEVICE_TOOL_NAMES) {
        assert(DIRECT_BLOCKED_TOOLS.includes(name), name);
      }
    });
  },
);
