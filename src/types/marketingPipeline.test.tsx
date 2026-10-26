import { describe, expect, it } from "vitest";
import {
  isApprovalMode,
  parseStageConfiguration,
  withSeoTableSettings,
} from "./marketingPipeline";

describe("marketing pipeline helpers", () => {
  it("recognizes approval modes", () => {
    expect(isApprovalMode("hybrid")).toBe(true);
    expect(isApprovalMode("sometimes")).toBe(false);
  });

  it("narrows SEO table report-mode settings", () => {
    expect(
      withSeoTableSettings({
        id: "t",
        integration_settings: {
          campaign_type: "leads",
          default_report_mode: 3,
          clientId: "c",
        },
      }),
    ).toEqual({
      id: "t",
      integration_settings: { campaign_type: "leads", clientId: "c" },
    });
    expect(
      withSeoTableSettings({ id: "t", integration_settings: "x" })
        .integration_settings,
    ).toBeNull();
  });

  it("parses stage configuration with defaults", () => {
    expect(
      parseStageConfiguration({
        instructions: "do",
        tools: ["web", 2],
        target: { website: "https://x" },
      }),
    ).toEqual({
      instructions: "do",
      tools: ["web"],
      target: { website: "https://x" },
    });
    expect(parseStageConfiguration(null)).toEqual({
      instructions: "",
      tools: [],
      target: {},
    });
  });
});
