import { describe, expect, it, vi } from "vitest";
import type { ClaimAnswer } from "./readActions.ts";
import { createReadActions } from "./readActions.ts";
import { ACTION_ID, fakeDevice, settle } from "./readActions.test-fixture.ts";
import {
  NO_CLAIM_FACTS,
  SHOT_OWNER,
  type ShotCard,
  shotDeps,
} from "./shotFlow.test-fixture.ts";

const HERE = { origin: "https://shop.example", path: "/items" };
const STORED = `${SHOT_OWNER}/1764150000000-tab.jpg`;
const PASSWORD = [{ type: "password", autocomplete: null, names: ["pw"] }];

/** A device whose claim hands over a screenshot, with the permission as the server read it. */
function shotDevice(allowed = false, args: unknown = {}) {
  const shots: ShotCard = { shown: [], answer: () => {}, drops: 0 };
  const device = { ...fakeDevice(shotDeps(shots)), shots };
  device.deps.claim = vi.fn(async (): Promise<ClaimAnswer> => ({
    ok: true,
    tool: "browser_screenshot",
    arguments: args,
    ...NO_CLAIM_FACTS,
    sensitiveScreenshotsAllowed: allowed,
  }));
  return device;
}

/** Starts the screenshot and lets it reach its first wait; the action's promise. */
async function started(device: ReturnType<typeof shotDevice>) {
  const running = createReadActions(device.deps).onAction(ACTION_ID);
  await settle();
  return { running };
}

describe("a screenshot of an ordinary page", () => {
  it("asks on the card every time, since Chrome captures only with a grant asked from a tap", async () => {
    const device = shotDevice();
    const { running } = await started(device);

    expect(device.shots.shown).toHaveLength(1);
    expect(device.shots.shown[0].title).toContain("לצלם");
    expect(device.shots.shown[0].text).toContain("מודל ה-AI");
    expect(device.shots.shown[0].text).toContain("Chrome");
    expect(device.shots.shown[0].text).not.toContain("דף רגיש");
    expect(device.deps.captureTab).not.toHaveBeenCalled();
    device.shots.answer("allowed");
    await running;

    expect(device.completed).toEqual([
      {
        action: "complete",
        id: ACTION_ID,
        status: "done",
        decision: "ask",
        observed: HERE,
        result: { ...HERE, storage_path: STORED },
        trust_origin: null,
      },
    ]);
  });

  it("gives the capture grant back right after the capture, before the upload", async () => {
    const device = shotDevice();
    let dropsAtUpload = -1;
    device.deps.uploadShot = vi.fn(async () => {
      dropsAtUpload = device.shots.drops;
      return STORED;
    });
    const { running } = await started(device);

    device.shots.answer("allowed");
    await running;

    expect(dropsAtUpload).toBe(1);
  });

  it("declined: nothing is captured or stored, and the grant is given back", async () => {
    const device = shotDevice();
    const { running } = await started(device);

    device.shots.answer("declined");
    await running;

    expect(device.deps.captureTab).not.toHaveBeenCalled();
    expect(device.deps.uploadShot).not.toHaveBeenCalled();
    expect(device.shots.drops).toBeGreaterThan(0);
    expect(device.completed[0]).toMatchObject({ status: "denied" });
  });
});

describe("a screenshot of a sensitive page", () => {
  it("a page with a password field is refused without the permission, before any card", async () => {
    const device = shotDevice(false);
    device.deps.pageFields = vi.fn(async () => [[], PASSWORD]);

    await (
      await started(device)
    ).running;

    expect(device.shots.shown).toEqual([]);
    expect(device.deps.captureTab).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({
      status: "refused",
      decision: "never",
    });
  });

  it("the act floor is refused without the permission", async () => {
    const device = shotDevice(false);
    device.setTabUrl("https://mail.google.com/mail/u/0/");

    await (
      await started(device)
    ).running;

    expect(device.shots.shown).toEqual([]);
    expect(device.deps.captureTab).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({ status: "refused" });
  });

  it("with the permission, the card says the page is sensitive and the picture is taken after the tap", async () => {
    const device = shotDevice(true);
    device.setTabUrl("https://mail.google.com/mail/u/0/");
    const { running } = await started(device);

    expect(device.shots.shown).toHaveLength(1);
    expect(device.shots.shown[0].text).toContain("דף רגיש");
    expect(device.deps.captureTab).not.toHaveBeenCalled();
    device.shots.answer("allowed");
    await running;

    expect(device.completed[0]).toMatchObject({
      status: "done",
      decision: "ask",
      observed: { origin: "https://mail.google.com", path: "/mail/u/0/" },
    });
  });

  it("a password field the grant reveals after the tap (another site's frame) gets its own sensitive card, or is refused", async () => {
    const allowed = shotDevice(true);
    allowed.deps.pageFields = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValue([[], PASSWORD]);
    const { running } = await started(allowed);
    allowed.shots.answer("allowed");
    await settle();

    expect(allowed.shots.shown).toHaveLength(2);
    expect(allowed.shots.shown[1].text).toContain("דף רגיש");
    allowed.shots.answer("allowed");
    await running;
    expect(allowed.completed[0]).toMatchObject({ status: "done" });

    const refused = shotDevice(false);
    refused.deps.pageFields = vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValue([PASSWORD]);
    const { running: second } = await started(refused);
    refused.shots.answer("allowed");
    await second;

    expect(refused.deps.captureTab).not.toHaveBeenCalled();
    expect(refused.completed[0]).toMatchObject({ status: "refused" });
    expect(refused.shots.drops).toBeGreaterThan(0);
  });

  it("a frame that answers anything but field facts counts as sensitive", async () => {
    const device = shotDevice(false);
    device.deps.pageFields = vi.fn(async () => [[], undefined]);

    await (
      await started(device)
    ).running;

    expect(device.completed[0]).toMatchObject({ status: "refused" });
  });
});

describe("the tab around the capture", () => {
  it("a tab that moved before the capture: nothing is captured", async () => {
    const device = shotDevice();
    const { running } = await started(device);

    device.setTabUrl("https://shop.example/items#secret");
    device.shots.answer("allowed");
    await running;

    expect(device.deps.captureTab).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({ status: "target_changed" });
  });

  it("a tab that moved while it was captured: the picture is never stored", async () => {
    const device = shotDevice();
    device.deps.captureTab = vi.fn(async () => {
      device.setActiveTabId(8);
      return "data:image/jpeg;base64,/9j/4AAQ";
    });
    const { running } = await started(device);

    device.shots.answer("allowed");
    await running;

    expect(device.deps.uploadShot).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({ status: "target_changed" });
  });

  it("sharing switched off refuses; arguments of any kind refuse", async () => {
    const off = shotDevice();
    off.deps.isTabShared = vi.fn(async () => false);
    await (
      await started(off)
    ).running;

    const argued = shotDevice(true, { url: "https://bank.example/" });
    await (
      await started(argued)
    ).running;

    for (const device of [off, argued]) {
      expect(device.shots.shown).toEqual([]);
      expect(device.deps.captureTab).not.toHaveBeenCalled();
      expect(device.completed[0]).toMatchObject({ status: "refused" });
    }
  });

  it("a cancel while the card waits takes no picture", async () => {
    const device = shotDevice();
    const actions = createReadActions(device.deps);
    const running = actions.onAction(ACTION_ID);
    await settle();

    actions.onCancel(ACTION_ID);
    await running;

    expect(device.deps.captureTab).not.toHaveBeenCalled();
    expect(device.completed[0]).toMatchObject({ status: "cancelled" });
  });
});
