import { assert } from "jsr:@std/assert@1";

Deno.test("manage-manus-wa index", async (t) => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  await t.step(
    "authorizes and guards send_message before the gateway call",
    () => {
      const start = source.indexOf('if (action === "send_message")');
      const auth = source.indexOf("manusSendRefusal(", start);
      const guard = source.indexOf("stagingBlockResponse(", start);
      const gateway = source.indexOf("gatewayRest(", start);
      assert(start > 0 && auth > start && guard > auth && gateway > guard);
      // Every action refuses the public anon key.
      assert(
        source.indexOf("anonRefusal(") <
          source.indexOf("createClient(SUPABASE_URL"),
      );
    },
  );
});
