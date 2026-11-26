import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { DIRECT_BLOCKED_TOOLS } from "../_shared/carmen-direct-tools.mjs";
import {
  DEVICE_TOOL_NAMES,
  isDeviceToolName,
} from "../_shared/carmen/device/contract.ts";
import { ALL_TOOLS } from "./tool-catalog.ts";
import { readRunSource } from "./run-source.test-fixture.ts";

const boundary = Deno.readTextFileSync(
  new URL("./request/handle.ts", import.meta.url),
);

/** Locates a required operation within its owning module. */
function at(source: string, text: string): number {
  const index = source.indexOf(text);
  assert(index >= 0, `Source lacks: ${text}`);
  return index;
}

// These source guards follow owners and explicit calls; device-turn/ tests its behavior.
Deno.test("run-ai-agent wires the device steps (AIO-686)", async (t) => {
  await t.step("a continuation never creates a conversation", () => {
    assertMatch(
      readRunSource("load-run-conversation"),
      /if \(\s*!serverConversationId &&\s*!deviceRequestOf\(bodyJson\).continuation\s*\) \{/,
    );
  });

  await t.step(
    "the device turn opens after the conversation and before every shortcut",
    () => {
      const conversation = readRunSource("load-run-conversation");
      assert(
        at(conversation, "await loadOrCreateConversation(run)") <
          at(conversation, "await openRunDeviceTurn(run)"),
      );
      assert(
        at(conversation, "await openRunDeviceTurn(run)") <
          at(conversation, "await tryConversationFastLane(run)"),
      );
      assertMatch(conversation, /if \(reply\) \{\s*return reply;/);
      assert(conversation.includes("deviceTurn.pinsModel ||"));
      assert(
        conversation.includes(
          'emit({ type: "conversation_id", id: serverConversationId });',
        ),
      );
      const device = readRunSource("open-run-device-turn");
      assert(
        device.includes("deviceTurn = await openDeviceTurn(supabase, emit, {"),
      );
      assertMatch(
        device,
        /if \(deviceTurn.reply\) \{\s*return deviceTurn.reply;/,
      );
      const agent = readRunSource("agent");
      assert(
        at(agent, "    loadRunConversation,") <
          at(agent, "    captureRunInstruction,"),
      );
    },
  );

  await t.step(
    "tools are withheld and offered after every tool source, before the messages",
    () => {
      const prepare = readRunSource("prepare-run-messages");
      const withheld = at(
        prepare,
        "filteredTools = deviceTurn.withoutWithheld(filteredTools);",
      );
      const offered = at(prepare, "expandAgentTools(deviceTurn.offeredTools);");
      assert(withheld < offered);
      assert(
        prepare
          .slice(withheld, offered)
          .includes("...deviceTurn.withoutWithheld(exposedMcpTools),"),
      );
      assert(
        offered < at(prepare, '[{ role: "system", content: systemPrompt }];'),
      );
      const agent = readRunSource("agent");
      for (const stage of ["loadRunMcpTools", "matchRunSkills"]) {
        assert(
          at(agent, `    ${stage},`) < at(agent, "    prepareRunMessages,"),
        );
      }
    },
  );

  await t.step(
    "the dispatch answers a device or withheld tool before any other executor",
    () => {
      const execute = readRunSource("execute-model-tool");
      const branch = at(execute, "} else if (deviceTurn.handles(toolName)) {");
      assertMatch(
        execute.slice(branch),
        /result = await deviceTurn.call\(toolName, toolArgs\);/,
      );
      assert(branch > at(execute, "result = workshopRefusal;"));
      assert(
        branch < at(execute, '} else if (toolName === "search_agent_tools") {'),
      );
      assert(
        branch < at(execute, "const executeMcp = mcpExecutors.get(toolName);"),
      );
      assert(branch < at(execute, "result = await executeTool("));
    },
  );

  await t.step(
    "the step is read from the tool's result, never from tool_call, and ends the turn",
    () => {
      const result = readRunSource("process-model-tool-result");
      const read = at(result, "deviceAction = deviceTurn.pausedAt(result);");
      assert(
        read >
          at(
            result,
            "toolLog.push({ tool: toolName, args: toolArgs, result });",
          ),
      );
      assertMatch(result.slice(read), /if \(deviceAction\) \{\s*return;/);
      const loop = readRunSource("run-model-loop");
      assert(
        at(loop, "await executeModelTool(run, tc, devSendTurn)") <
          at(loop, "processModelToolResult(run, round, tc, execution, tools)"),
      );
      assertMatch(
        loop,
        /processModelToolResult\(run, round, tc, execution, tools\);\s*if \(deviceAction\) \{\s*break;/,
      );
      assertMatch(
        loop,
        /messages.push\(\.\.\.tools.toolResults\);\s*if \(deviceAction\) \{\s*finalOutput = devicePauseAnswer\(msg.content\);\s*emitText\(finalOutput\);\s*break;/,
      );
      assert(
        at(loop, "devicePauseAnswer(msg.content)") <
          at(loop, "finalizeLoopText(run,"),
      );
      assert(
        readRunSource("emit-loop-text").includes(
          "const fallback = fallbackReply(toolLog, {",
        ),
      );
    },
  );

  await t.step("a continuation saves its answer only", () => {
    assert(
      readRunSource("persist-run-completion").includes(
        "message: deviceTurn.continuing ? null : String(command_text),",
      ),
    );
    assert(
      readRunSource("save-conversation-turn").includes(
        "const messages = savedTurnMessages(turn.history, turn.message, turn.answer);",
      ),
    );
  });

  await t.step(
    "a continuation's text is fixed before anything reads the body",
    () => {
      const fixed = at(boundary, "fixContinuationText(bodyJson);");
      assert(
        fixed >
          at(
            boundary,
            "const tenantDenied = await dependencies.runTenantDenied(",
          ),
      );
      assert(
        fixed < at(boundary, "const wantStream = bodyJson.stream === true;"),
      );
      assert(
        fixed < boundary.lastIndexOf("await dependencies.handleRunAgent("),
      );
    },
  );

  await t.step(
    "a continuation skips the acknowledgement, the recall and the auto-memory",
    () => {
      assertMatch(
        readRunSource("load-run-agent"),
        /!pinSkillsOnly &&\s*!deviceRequestOf\(bodyJson\).continuation\s*\) \{\s*emit\(\{\s*type: "status",/,
      );
      assertMatch(
        readRunSource("append-v1-recall-and-lead"),
        /const recalled = deviceTurn.continuing\s*\? \[\]\s*:/,
      );
      assertMatch(
        readRunSource("persist-run-completion"),
        /finalOutput &&\s*!deviceTurn.continuing &&\s*command_text\?\.trim\(\).length >= 10/,
      );
    },
  );

  await t.step("both replies tell the site a step is waiting", () => {
    assertMatch(
      readRunSource("persist-run-completion"),
      /conversation_id: serverConversationId,\s*device_action: deviceAction,/,
    );
    assertMatch(
      Deno.readTextFileSync(new URL("./request/stream.ts", import.meta.url)),
      /error: final.error,\s*device_action: final.device_action,/,
    );
  });

  await t.step("the resumed step joins the user turn only", () => {
    const prepare = readRunSource("prepare-run-messages");
    assertMatch(
      prepare,
      /const userTurn = deviceTurn.userTurn\(\s*withBrowserTab\(command_text, bodyJson.context_metadata\),\s*\);/,
    );
    const system = at(prepare, '[{ role: "system", content: systemPrompt }];');
    assertEquals(
      prepare.slice(0, system).includes("deviceTurn.userTurn("),
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
