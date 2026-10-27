import { assertEquals } from "jsr:@std/assert@1";
import {
  resolveCarmenReportRecipients,
  type ReportStaffMember,
} from "./resolve.ts";

const OWNER: ReportStaffMember = {
  user_id: "u-owner",
  full_name: "Owner One",
  phone: "050-000-0001",
  is_owner: true,
};

const MANAGER: ReportStaffMember = {
  user_id: "u-manager",
  full_name: "Manager",
  phone: "972500000002",
  is_owner: false,
};

const NO_PHONE: ReportStaffMember = {
  user_id: "u-nophone",
  full_name: "No Phone",
  phone: null,
  is_owner: false,
};

const STAFF = [OWNER, MANAGER, NO_PHONE];

Deno.test("resolveCarmenReportRecipients", async (t) => {
  await t.step("returns the configured list in order", () => {
    const result = resolveCarmenReportRecipients({
      configured: [
        { user_id: "u-manager", phone: null, label: null },
        { user_id: null, phone: "+972500000009", label: "Partner" },
      ],
      staff: STAFF,
    });

    assertEquals(result.recipients, [
      {
        user_id: "u-manager",
        name: "Manager",
        phone: "972500000002",
        source: "configured",
      },
      { name: "Partner", phone: "972500000009", source: "configured" },
    ]);
    assertEquals(result.skipped, []);
  });

  await t.step("a configured list replaces the owners", () => {
    const result = resolveCarmenReportRecipients({
      configured: [{ user_id: null, phone: "+972500000009", label: "Partner" }],
      staff: STAFF,
    });

    assertEquals(
      result.recipients.map((r) => r.phone),
      ["972500000009"],
    );
  });

  await t.step("an empty list falls back to the owners with phones", () => {
    const ownerWithoutPhone = {
      ...NO_PHONE,
      user_id: "u-owner2",
      full_name: "Owner Two",
      is_owner: true,
    };
    const result = resolveCarmenReportRecipients({
      configured: [],
      staff: [...STAFF, ownerWithoutPhone],
    });

    assertEquals(result.recipients, [
      {
        user_id: "u-owner",
        name: "Owner One",
        phone: "972500000001",
        source: "owner_fallback",
      },
    ]);
    assertEquals(result.skipped, [
      {
        user_id: "u-owner2",
        name: "Owner Two",
        reason: "member_without_phone",
      },
    ]);
  });

  await t.step("dedupes by normalised phone, first entry wins", () => {
    const result = resolveCarmenReportRecipients({
      configured: [
        { user_id: "u-owner", phone: null, label: null },
        { user_id: null, phone: "+972500000001", label: "Same phone" },
      ],
      staff: STAFF,
    });

    assertEquals(
      result.recipients.map((r) => r.user_id),
      ["u-owner"],
    );
    assertEquals(result.skipped, [
      { name: "Same phone", reason: "duplicate_phone" },
    ]);
  });

  await t.step("skips a member without a phone with a reason", () => {
    const result = resolveCarmenReportRecipients({
      configured: [
        { user_id: "u-nophone", phone: null, label: null },
        { user_id: "u-manager", phone: null, label: null },
      ],
      staff: STAFF,
    });

    assertEquals(
      result.recipients.map((r) => r.user_id),
      ["u-manager"],
    );
    assertEquals(result.skipped, [
      {
        user_id: "u-nophone",
        name: "No Phone",
        reason: "member_without_phone",
      },
    ]);
  });

  await t.step("skips a configured user who is no longer staff", () => {
    const result = resolveCarmenReportRecipients({
      configured: [{ user_id: "u-gone", phone: null, label: null }],
      staff: STAFF,
    });

    assertEquals(result.recipients, []);
    assertEquals(result.skipped, [
      { user_id: "u-gone", name: "חבר צוות", reason: "not_staff" },
    ]);
  });

  await t.step("skips a member phone that cannot be a WhatsApp number", () => {
    const result = resolveCarmenReportRecipients({
      configured: [{ user_id: "u-manager", phone: null, label: null }],
      staff: [{ ...MANAGER, phone: "123" }],
    });

    assertEquals(result.recipients, []);
    assertEquals(result.skipped, [
      { user_id: "u-manager", name: "Manager", reason: "invalid_phone" },
    ]);
  });

  await t.step("never returns anyone but configured rows and staff", () => {
    const result = resolveCarmenReportRecipients({
      configured: [],
      staff: [MANAGER, NO_PHONE],
    });

    assertEquals(result, { recipients: [], skipped: [] });
  });
});
