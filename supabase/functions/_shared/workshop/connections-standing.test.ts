import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { connectionsStanding } from "./connections-standing.ts";

Deno.test(
  "outside the workshop Carmen is not told to call a tool she does not have",
  () => {
    assertStrictEquals(connectionsStanding(false), "");
  },
);

Deno.test(
  "in the workshop the connections rule agrees with the skins: the engine is never asked",
  () => {
    const rule = connectionsStanding(true);
    assertMatch(rule, /workshop_check_connections/);
    // The skins and the briefing never ask which engine (20261026102400, briefing.ts).
    assertStrictEquals(/שואלים את המשתמש באיזה/.test(rule), false);
    assertMatch(rule, /אל תשאלי את המשתמש באיזה מנוע/);
  },
);
