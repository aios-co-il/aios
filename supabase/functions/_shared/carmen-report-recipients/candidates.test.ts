import { assertEquals } from "jsr:@std/assert@1";
import { configuredCandidate, dedupeByPhone } from "./candidates.ts";
import type {
  ConfiguredReportRecipient,
  ReportStaffMember,
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

/** The configured rows through the candidate steps, as the resolver runs them. */
function resolveRows(input: {
  configured: ConfiguredReportRecipient[];
  staff: ReportStaffMember[];
  clientPhones?: string[];
}) {
  const staffById = new Map(input.staff.map((m) => [m.user_id, m]));
  const clientPhones = new Set(input.clientPhones);
  return dedupeByPhone(
    input.configured.map((row) =>
      configuredCandidate(row, staffById, clientPhones),
    ),
  );
}

Deno.test("configuredCandidate and dedupeByPhone", async (t) => {
  await t.step("dedupes by normalised phone, first entry wins", () => {
    const result = resolveRows({
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
      {
        name: "Same phone",
        extra_phone: "+972500000001",
        source: "configured",
        reason: "duplicate_phone",
      },
    ]);
  });

  await t.step("skips an extra phone that now belongs to a client", () => {
    const result = resolveRows({
      configured: [
        { user_id: null, phone: "+972500000009", label: "Partner" },
        { user_id: "u-manager", phone: null, label: null },
      ],
      staff: STAFF,
      clientPhones: ["+972500000009"],
    });

    assertEquals(
      result.recipients.map((r) => r.user_id),
      ["u-manager"],
    );
    assertEquals(result.skipped, [
      {
        name: "Partner",
        extra_phone: "+972500000009",
        source: "configured",
        reason: "client_phone",
      },
    ]);
  });

  await t.step(
    "two extra phones with one label are told apart by phone",
    () => {
      const result = resolveRows({
        configured: [
          { user_id: null, phone: "+972500000007", label: "Office" },
          { user_id: null, phone: "+9720500000007", label: "Office" },
        ],
        staff: STAFF,
      });

      assertEquals(result.skipped, [
        {
          name: "Office",
          extra_phone: "+9720500000007",
          source: "configured",
          reason: "duplicate_phone",
        },
      ]);
    },
  );

  await t.step("skips a member without a phone with a reason", () => {
    const result = resolveRows({
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
        source: "configured",
        reason: "member_without_phone",
      },
    ]);
  });

  await t.step("skips a configured user who is no longer staff", () => {
    const result = resolveRows({
      configured: [{ user_id: "u-gone", phone: null, label: null }],
      staff: [MANAGER],
    });

    assertEquals(result.recipients, []);
    assertEquals(result.skipped, [
      {
        user_id: "u-gone",
        name: "חבר צוות",
        source: "configured",
        reason: "not_staff",
      },
    ]);
  });
});
