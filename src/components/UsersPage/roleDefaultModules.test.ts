import { describe, expect, it } from "vitest";
import { getAllModules } from "@/lib/modules";
import { roleDefaultModules } from "./roleDefaultModules";

describe("roleDefaultModules", () => {
  it("gives a campaigner the campaign modules", () => {
    expect(roleDefaultModules("campaigner")).toEqual([
      "dashboard",
      "clients",
      "tasks",
      "chat",
      "time_tracking",
      "dynamic_tables",
    ]);
  });

  it("gives an owner every module", () => {
    expect(roleDefaultModules("owner")).toEqual(
      getAllModules().map((module) => module.id),
    );
  });

  it("starts a role without defaults empty", () => {
    expect(roleDefaultModules("super_admin")).toEqual([]);
  });

  it("returns a copy the caller can change", () => {
    roleDefaultModules("seo").push("leads");

    expect(roleDefaultModules("seo")).not.toContain("leads");
  });
});
