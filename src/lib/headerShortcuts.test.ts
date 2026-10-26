import { expect, test } from "vitest";
import {
  DEFAULT_HEADER_SHORTCUT_KEYS,
  headerShortcutsStorageKey,
  resolveHeaderShortcuts,
  toggleHeaderShortcut,
} from "./headerShortcuts.ts";

const accessible = [
  "tasks",
  "clients",
  "dynamic-tables",
  "leads",
  "chat",
  "dashboard",
];

test("new users get tasks, clients and reports when accessible", () => {
  expect(resolveHeaderShortcuts(null, accessible)).toStrictEqual([
    ...DEFAULT_HEADER_SHORTCUT_KEYS,
  ]);
});

test("saved empty selection remains empty", () => {
  expect(resolveHeaderShortcuts("[]", accessible)).toStrictEqual([]);
});

test("corrupt storage recovers to defaults", () => {
  expect(resolveHeaderShortcuts("{bad json", accessible)).toStrictEqual([
    ...DEFAULT_HEADER_SHORTCUT_KEYS,
  ]);
  expect(
    resolveHeaderShortcuts(JSON.stringify({ tasks: true }), accessible),
  ).toStrictEqual([...DEFAULT_HEADER_SHORTCUT_KEYS]);
});

test("inaccessible, stale and duplicate modules are removed", () => {
  expect(
    resolveHeaderShortcuts(
      JSON.stringify(["tasks", "forbidden", "tasks", "leads"]),
      accessible,
    ),
  ).toStrictEqual(["tasks", "leads"]);
});

test("shortcut selection is capped and can always be removed", () => {
  const full = ["tasks", "clients", "dynamic-tables", "leads", "chat"];
  expect(toggleHeaderShortcut(full, "dashboard")).toStrictEqual(full);
  expect(toggleHeaderShortcut(full, "tasks")).toStrictEqual([
    "clients",
    "dynamic-tables",
    "leads",
    "chat",
  ]);
});

test("storage is isolated per user and tenant", () => {
  expect(headerShortcutsStorageKey("user-a", "tenant-a")).toBe(
    "headerShortcuts:user-a:tenant-a",
  );
  expect(headerShortcutsStorageKey("user-a", "tenant-a")).not.toBe(
    headerShortcutsStorageKey("user-a", "tenant-b"),
  );
});
