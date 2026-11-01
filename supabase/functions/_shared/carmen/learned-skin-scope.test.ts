import { assertMatch } from "jsr:@std/assert@1";
import { GLOBAL_SKIN_RULE } from "./learned-skin-scope.ts";

Deno.test(
  "GLOBAL_SKIN_RULE ships org-wide conduct as a global row in a migration",
  () => {
    assertMatch(GLOBAL_SKIN_RULE, /scope='global'.*tenant_id NULL.*migration/);
  },
);
