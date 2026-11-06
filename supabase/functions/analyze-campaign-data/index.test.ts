import { assert, assertMatch, assertNotMatch } from "jsr:@std/assert@1";

/**
 * The handler cannot run without a database, so its wiring is read from the
 * source; the table read itself is tested in caller-table.test.ts.
 */
const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("analyze-campaign-data wiring (AIO-495)", async (t) => {
  await t.step(
    "reads the table as the caller, never with the service client",
    () => {
      assertMatch(
        source,
        /const callerDb = userClient\(req\.headers\.get\("Authorization"\) \?\? ""\);/,
      );
      assertMatch(source, /callerDb\s*\.from\("crm_tables"\)/);
      assertNotMatch(source, /supabase\s*\.from\("crm_tables"\)/);
    },
  );

  await t.step(
    "checks the caller's access before creating the service client",
    () => {
      const check = source.indexOf("if (!callerTable.ok)");
      const service = source.indexOf("serviceClient()");
      assert(check > 0 && service > check);
    },
  );
});
