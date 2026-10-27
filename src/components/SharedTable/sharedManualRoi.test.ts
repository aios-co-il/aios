import { describe, expect, it } from "vitest";
import { sharedManualRoiFigures } from "./sharedManualRoi";

const summary = { spend: 500, leads: 0, hasLeads: false };
const entered = { manual_roi: { closures: 2, revenue: 3000 } };

describe("sharedManualRoiFigures", () => {
  it("uses the lead campaigns' spend and leads", () => {
    expect(
      sharedManualRoiFigures({
        leadRows: [
          { spend: 100, leads: 5 },
          { spend: 60, leads: 3 },
        ],
        summary: { spend: 500, leads: 8, hasLeads: true },
        integrationSettings: entered,
      }),
    ).toStrictEqual({ spend: 160, leads: 8 });
  });

  it("never counts sales spend as the cost of lead campaigns that spent nothing", () => {
    expect(
      sharedManualRoiFigures({
        leadRows: [{ spend: 0, leads: 4 }],
        summary: { spend: 900, leads: 4, hasLeads: true },
        integrationSettings: entered,
      }),
    ).toStrictEqual({ spend: 0, leads: 4 });
  });

  it("keeps entered figures on a range without lead campaigns, with no sales spend", () => {
    expect(
      sharedManualRoiFigures({
        leadRows: [],
        summary,
        integrationSettings: entered,
      }),
    ).toStrictEqual({ spend: 0, leads: 0 });
  });

  it("hides the card without lead campaigns or entered figures", () => {
    expect(
      sharedManualRoiFigures({
        leadRows: [],
        summary,
        integrationSettings: {},
      }),
    ).toBeNull();
  });
});
