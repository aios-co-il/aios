import { describe, expect, test } from "vitest";
import { fakeChatTagsDb } from "./fakeChatTagsDb";
import { removeContactTag, TAG_REMOVE_REFUSED } from "./removeContactTag";

/** A tag link row for tag-1 in tenant-1 unless overridden. */
function link(id: string, fields: Record<string, unknown>) {
  return { id, tenant_id: "tenant-1", tag_id: "tag-1", ...fields };
}

describe("removeContactTag", () => {
  test("removes the tag for the tenant, whoever added it", async () => {
    const rows = [
      link("1", { lead_id: "l1", user_id: "teammate" }),
      link("2", { lead_id: "l1", tenant_id: "tenant-2" }),
      link("3", { lead_id: "l1", tag_id: "tag-2" }),
    ];
    const db = fakeChatTagsDb({ chat_contact_tags: rows });

    await expect(
      removeContactTag(db, "tenant-1", "tag-1", { type: "lead", id: "l1" }),
    ).resolves.toBe("removed");
    expect(rows.map((row) => row.id)).toEqual(["2", "3"]);
  });

  test("a contact without the tag is nothing to do, not a refusal", async () => {
    const rows = [link("1", { lead_id: "other-lead" })];
    const db = fakeChatTagsDb({ chat_contact_tags: rows });

    await expect(
      removeContactTag(db, "tenant-1", "tag-1", { type: "lead", id: "l1" }),
    ).resolves.toBe("absent");
    expect(rows).toHaveLength(1);
  });

  test("a row RLS keeps is a refusal, not a silent success", async () => {
    const rows = [link("1", { client_id: "c1" })];
    const db = fakeChatTagsDb({ chat_contact_tags: rows, keptIds: ["1"] });

    await expect(
      removeContactTag(db, "tenant-1", "tag-1", { type: "client", id: "c1" }),
    ).rejects.toThrow(TAG_REMOVE_REFUSED);
    expect(rows).toHaveLength(1);
  });

  test("an unknown contact is matched by its phone", async () => {
    const rows = [link("1", { sender_phone: "972500000000" })];
    const db = fakeChatTagsDb({ chat_contact_tags: rows });

    await expect(
      removeContactTag(db, "tenant-1", "tag-1", {
        type: "unknown",
        id: "",
        senderPhone: "972500000000",
      }),
    ).resolves.toBe("removed");
    expect(rows).toHaveLength(0);
  });
});
