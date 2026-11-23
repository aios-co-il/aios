import { describe, expect, it } from "vitest";
import {
  readTaskResult,
  readExecutionResult,
  readMcpTools,
  readEvalResults,
  validateEvalDataset,
  readParallelSubtasks,
  readHeartbeatActions,
} from "./agentUiModels";
describe("agent panel contracts", () => {
  it("reads valid task fields independently of malformed siblings", () => {
    expect(
      readTaskResult({
        output: "done",
        error: { message: "bad" },
        tool_log: [
          {
            tool: "generate_ad_image",
            result: { image_url: "https://example.com/image", success: true },
          },
        ],
      }),
    ).toMatchObject({
      output: "done",
      error: undefined,
      tool_log: [
        {
          tool: "generate_ad_image",
          result: { image_url: "https://example.com/image" },
        },
      ],
    });
  });
  it("rejects malformed approval links and MCP tool names", () => {
    expect(
      readExecutionResult({ pr_url: { url: "x" } }).pr_url,
    ).toBeUndefined();
    expect(readMcpTools([{ name: "valid" }, { name: 42 }])).toEqual([
      { name: "valid" },
    ]);
  });
  it("validates eval cases and boolean verdicts", () => {
    expect(() =>
      validateEvalDataset([{ input: {}, expected: "ok" }]),
    ).toThrow();
    expect(
      readEvalResults([{ passed: "false", score: 1, input: "q" }])[0].passed,
    ).toBe(false);
  });
  it("accepts only executable subtasks and labeled heartbeat actions", () => {
    expect(() => readParallelSubtasks([{ title: {} }])).toThrow();
    expect(readParallelSubtasks(null)).toEqual([]);
    expect(
      readHeartbeatActions([
        { type: "reminder_sent", task_title: "task" },
        null,
      ]),
    ).toEqual([{ type: "reminder_sent", task_title: "task" }]);
  });
});
