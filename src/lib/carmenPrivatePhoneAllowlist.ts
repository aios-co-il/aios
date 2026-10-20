export type StoredPrivatePhoneRow = {
  phone: string;
  label?: string;
  status?: string;
  source?: string;
  dev_escalation_tier?: string | null;
  surfaces?: string[];
  relationship_note?: string;
};

// Merging assigns one of these sources; stored metadata may contain other strings.
export type PrivatePhoneRow = Omit<StoredPrivatePhoneRow, "source"> & {
  source?: "policy" | "identity" | "automation";
};

export type IdentityRow = {
  phone: string;
  display_name?: string | null;
  status?: string;
  surfaces?: string[] | null;
  dev_escalation_tier?: string | null;
  relationship_note?: string | null;
};

export function normalizePrivatePhone(p: string) {
  return (p || "").replace(/\D/g, "");
}

function sourcePriority(source: PrivatePhoneRow["source"]) {
  if (source === "policy") {
    return 3;
  }

  if (source === "identity") {
    return 2;
  }

  if (source === "automation") {
    return 1;
  }

  return 0;
}

/** Merge policy, identities, and automation into one private-allowlist view. */
export function mergePrivatePhoneAllowlist(params: {
  policyPhones?: StoredPrivatePhoneRow[];
  identities?: IdentityRow[];
  automationPhones?: string[];
}): PrivatePhoneRow[] {
  const byPhone = new Map<string, PrivatePhoneRow>();

  const upsert = (row: PrivatePhoneRow, priority: number) => {
    const phone = normalizePrivatePhone(row.phone);
    if (phone.length < 9) {
      return;
    }

    const prev = byPhone.get(phone);
    if (!prev || priority >= sourcePriority(prev.source)) {
      byPhone.set(phone, {
        ...prev,
        ...row,
        phone,
        surfaces: row.surfaces?.length
          ? row.surfaces
          : prev?.surfaces || ["whatsapp_private"],
      });
    }
  };

  for (const p of params.automationPhones || []) {
    upsert(
      { phone: p, surfaces: ["whatsapp_private"], source: "automation" },
      1,
    );
  }

  for (const id of params.identities || []) {
    const surfaces = Array.isArray(id.surfaces)
      ? id.surfaces
      : ["whatsapp_private", "whatsapp_group"];
    if (!surfaces.includes("whatsapp_private")) {
      continue;
    }

    upsert(
      {
        phone: id.phone,
        label: id.display_name || undefined,
        status: id.status,
        surfaces,
        dev_escalation_tier: id.dev_escalation_tier || null,
        relationship_note: id.relationship_note || undefined,
        source: "identity",
      },
      2,
    );
  }

  for (const p of params.policyPhones || []) {
    upsert({ ...p, source: "policy" }, 3);
  }

  return Array.from(byPhone.values()).sort((a, b) =>
    (a.label || a.phone).localeCompare(b.label || b.phone, "he"),
  );
}

/** Decode stored JSON without discarding supported custom string metadata.
 */
export function decodePrivatePhoneRows(
  value: unknown,
): StoredPrivatePhoneRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row: unknown) => {
    if (
      !row ||
      typeof row !== "object" ||
      !("phone" in row) ||
      typeof row.phone !== "string"
    ) {
      return [];
    }

    return [
      {
        phone: row.phone,
        label:
          "label" in row && typeof row.label === "string"
            ? row.label
            : undefined,
        status:
          "status" in row && typeof row.status === "string"
            ? row.status
            : undefined,
        source:
          "source" in row && typeof row.source === "string"
            ? row.source
            : undefined,
        dev_escalation_tier:
          "dev_escalation_tier" in row &&
          typeof row.dev_escalation_tier === "string"
            ? row.dev_escalation_tier
            : null,
        surfaces:
          "surfaces" in row && Array.isArray(row.surfaces)
            ? row.surfaces.filter(
                (surface: unknown): surface is string =>
                  typeof surface === "string",
              )
            : undefined,
        relationship_note:
          "relationship_note" in row &&
          typeof row.relationship_note === "string"
            ? row.relationship_note
            : undefined,
      },
    ];
  });
}
