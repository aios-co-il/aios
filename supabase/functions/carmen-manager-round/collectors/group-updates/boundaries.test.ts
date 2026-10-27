/**
 * The collector reads client groups and drafts; it never grants Carmen
 * access to a group, never sends, and reads Green API rows only through the
 * service-role function (plan C4/C20, Green API is David's phone).
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const folder = new URL("./", import.meta.url);
const migration = new URL(
  "../../../../migrations/20261027103000_carmen_group_updates.sql",
  import.meta.url,
);

/** The collector's own source files, tests excluded. */
async function sources(): Promise<[string, string][]> {
  const files: [string, string][] = [];
  for await (const entry of Deno.readDir(folder)) {
    if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push([
        entry.name,
        await Deno.readTextFile(new URL(entry.name, folder)),
      ]);
    }
  }
  return files;
}

Deno.test("group-updates boundaries", async (t) => {
  await t.step(
    "never touches Carmen's group access or allowlists",
    async () => {
      for (const [name, text] of await sources()) {
        assert(
          !/allowed_group_ids|carmen_client_group_access/.test(text),
          name,
        );
      }
    },
  );

  await t.step("never sends and never reads chat rows directly", async () => {
    for (const [name, text] of await sources()) {
      assert(
        !/send-|sendStaff|green-api|manage-manus|from\("chat_messages"\)/.test(
          text,
        ),
        name,
      );
    }
  });

  await t.step("the SQL only reads Carmen's group access", async () => {
    const sql = await Deno.readTextFile(migration);
    assertEquals(
      sql.match(
        /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.carmen_client_group_access/g,
      ),
      null,
    );
    assertEquals(/allowed_group_ids/.test(sql), false);
  });
});
