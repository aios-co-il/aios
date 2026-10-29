import { describe, expect, it } from "vitest";
import { reportSender } from "../../../supabase/functions/_shared/report-sender/fixture.ts";
import {
  forScheduleCreator,
  resolveScheduleSender,
  type ScheduleSenderInput,
  scheduleSenderToSave,
} from "./scheduleSender";

const carmen = reportSender("carmen", { integration_type: "manus_wa" });
const own = reportSender("own", { owner_user_id: "u1" });
const office = reportSender("office");

/** The form of user u1 with Carmen's line and u1's own, unless overridden. */
const input = (
  overrides: Partial<ScheduleSenderInput>,
): ScheduleSenderInput => ({
  senders: [carmen, own],
  tenantDefaultId: null,
  userId: "u1",
  value: null,
  nullFollowsDefault: false,
  ...overrides,
});

/** The status and line id (or error) a form resolves to. */
function outcome(overrides: Partial<ScheduleSenderInput>) {
  const state = resolveScheduleSender(input(overrides));
  return "sender" in state
    ? { status: state.status, id: state.sender.id }
    : { status: state.status, error: state.error };
}

describe("resolveScheduleSender", () => {
  it("pins the line a NULL schedule resolves to", () => {
    // The only line (a Manus-only tenant), then the saver's own line.
    expect(outcome({ senders: [carmen] })).toEqual({
      status: "line",
      id: "carmen",
    });
    expect(outcome({ nullFollowsDefault: true })).toEqual({
      status: "line",
      id: "own",
    });
  });

  it("follows the default only when that was chosen and there is a choice", () => {
    const withDefault = { tenantDefaultId: "carmen" };
    expect(outcome({ ...withDefault, nullFollowsDefault: true })).toEqual({
      status: "follows_default",
      id: "carmen",
    });
    // A new schedule stores the default's line itself.
    expect(outcome(withDefault)).toEqual({ status: "line", id: "carmen" });
    // With one line there is nothing to follow.
    expect(
      outcome({ ...withDefault, senders: [carmen], nullFollowsDefault: true }),
    ).toEqual({ status: "line", id: "carmen" });
  });

  it("checks a stored line by the worker's rule", () => {
    expect(outcome({ value: "own" })).toEqual({ status: "line", id: "own" });
    expect(outcome({ value: "gone" })).toEqual({
      status: "unusable",
      error: "sender_not_allowed",
    });
    expect(
      outcome({
        senders: [carmen, reportSender("off", { ready: false })],
        value: "off",
      }),
    ).toEqual({ status: "unusable", error: "not_configured" });
  });

  it("says when nothing resolves", () => {
    expect(outcome({ senders: [] })).toEqual({
      status: "none",
      error: "no_report_sender",
    });
    expect(outcome({ senders: [carmen, office] })).toEqual({
      status: "none",
      error: "choose_sender",
    });
  });

  it("never stores a shared line nobody chose", () => {
    const shared = reportSender("shared", { is_shared: true });
    expect(outcome({ senders: [shared] })).toEqual({
      status: "none",
      error: "choose_sender",
    });
    // The tenant's own line is still taken when it is its only one.
    expect(outcome({ senders: [carmen, shared], userId: null })).toEqual({
      status: "line",
      id: "carmen",
    });
    expect(outcome({ senders: [shared], value: "shared" })).toEqual({
      status: "line",
      id: "shared",
    });
  });

  it("refuses an organization default that can no longer send", () => {
    // The default line was switched off or unshared; no line replaces it.
    for (const nullFollowsDefault of [true, false]) {
      expect(outcome({ tenantDefaultId: "off", nullFollowsDefault })).toEqual({
        status: "none",
        error: "stale_default",
      });
    }
  });
});

describe("scheduleSenderToSave", () => {
  const line = resolveScheduleSender(input({}));
  const follows = resolveScheduleSender(
    input({ tenantDefaultId: "carmen", nullFollowsDefault: true }),
  );
  const none = resolveScheduleSender(input({ senders: [carmen, office] }));
  const on = { required: true, isNew: false };
  const off = { required: false, isNew: false };

  it("stores the line id, or NULL to follow the default", () => {
    expect(scheduleSenderToSave(line, null, on)).toEqual({ id: "own" });
    expect(scheduleSenderToSave(follows, null, on)).toEqual({ id: null });
  });

  it("blocks an enabled WhatsApp schedule without a working line", () => {
    expect(scheduleSenderToSave(none, null, on)).toEqual({
      error: "choose_sender",
    });
    const stale = resolveScheduleSender(
      input({ tenantDefaultId: "off", nullFollowsDefault: true }),
    );
    expect(scheduleSenderToSave(stale, null, on)).toEqual({
      error: "stale_default",
    });
    expect(
      scheduleSenderToSave({ status: "pending", error: "loading" }, null, on),
    ).toEqual({ error: "loading" });
  });

  it("lets a stored schedule that is off keep what it has", () => {
    expect(scheduleSenderToSave(none, null, off)).toEqual({ id: null });
    // A NULL line is pinned only when the schedule is saved switched on.
    expect(scheduleSenderToSave(line, null, off)).toEqual({ id: null });
    const gone = resolveScheduleSender(input({ value: "gone" }));
    expect(scheduleSenderToSave(gone, "gone", off)).toEqual({ id: "gone" });
  });

  it("stores the line a new schedule saved off resolves to, if any", () => {
    const newOff = { required: false, isNew: true };
    expect(scheduleSenderToSave(line, null, newOff)).toEqual({ id: "own" });
    expect(scheduleSenderToSave(none, null, newOff)).toEqual({ id: null });
  });
});

describe("forScheduleCreator", () => {
  const privateLine = reportSender("own", {
    owner_user_id: "u1",
    org_wide: false,
  });
  const options = {
    senders: [carmen, privateLine],
    tenantDefaultId: null,
    canManage: false,
  };

  it("resolves a new or own schedule for the viewer, with all their lines", () => {
    for (const saved of [null, { created_by: "u1" }]) {
      expect(forScheduleCreator(options, "u1", saved)).toEqual({
        options,
        creatorId: "u1",
      });
    }
  });

  it("keeps only org-wide lines on another member's schedule", () => {
    for (const createdBy of ["u2", null]) {
      const view = forScheduleCreator(options, "u1", { created_by: createdBy });
      expect(view.creatorId).toBe(createdBy);
      expect(view.options.senders).toEqual([carmen]);
    }
  });
});
