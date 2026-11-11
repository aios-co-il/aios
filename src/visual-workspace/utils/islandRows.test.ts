import { describe, expect, it } from "vitest";
import {
  readIslandAgents,
  readIslandItems,
  readRecentMessages,
  toAgentRole,
} from "./islandRows";

describe("toAgentRole", () => {
  it("keeps known roles and falls back to ceo", () => {
    expect(toAgentRole("finance")).toBe("finance");
    expect(toAgentRole(null)).toBe("ceo");
    expect(toAgentRole("janitor")).toBe("ceo");
  });
});

describe("readIslandItems", () => {
  it("keeps absent fields undefined and present nulls null", () => {
    const [item] = readIslandItems([
      { id: "c1", name: "Acme", status: null, mood_status: "happy" },
    ]);
    expect(item).toEqual({
      id: "c1",
      name: "Acme",
      title: undefined,
      content: undefined,
      supplier_name: undefined,
      integration_name: undefined,
      status: null,
      active: undefined,
    });
  });

  it("drops rows without a string id and non-array input", () => {
    expect(readIslandItems([{ name: "x" }, null, "row"])).toEqual([]);
    expect(readIslandItems(null)).toEqual([]);
  });
});

describe("readIslandAgents / readRecentMessages", () => {
  it("reads agent and message fields", () => {
    expect(
      readIslandAgents([{ id: "a", name: "Bot", active: false }])[0],
    ).toMatchObject({ id: "a", name: "Bot", active: false });
    expect(
      readRecentMessages([
        { id: "m", direction: "outbound", created_at: "2026-01-01" },
      ])[0],
    ).toEqual({
      id: "m",
      direction: "outbound",
      created_at: "2026-01-01",
      message: undefined,
    });
  });
});

describe("island row schemas", () => {
  it("turns non-text values into text and truthy values into booleans", () => {
    expect(
      readIslandItems([{ id: "i", name: 42, active: 1, status: false }])[0],
    ).toMatchObject({ name: "42", active: true, status: "false" });
  });

  it("drops rows with a non-string id and keeps the rest", () => {
    expect(
      readIslandAgents([{ id: 7, name: "x" }, [], { id: "a" }]).map(
        (agent) => agent.id,
      ),
    ).toEqual(["a"]);
    expect(readRecentMessages({ id: "m" })).toEqual([]);
  });
});
