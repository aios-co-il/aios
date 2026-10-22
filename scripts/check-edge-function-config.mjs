// Supabase Branching deploys only functions declared as [functions.<name>] in
// supabase/config.toml, so every function directory needs an entry (and vice versa).
import { readdirSync, readFileSync } from "node:fs";

const dirs = readdirSync("supabase/functions", { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

const config = readFileSync("supabase/config.toml", "utf8");
const declared = [...config.matchAll(/^\[functions\.("?)([^\]"]+)\1\]/gm)].map(
  (m) => m[2],
);

const missing = dirs.filter((n) => !declared.includes(n));
const stale = declared.filter((n) => !dirs.includes(n));

if (missing.length || stale.length) {
  for (const n of missing)
    console.error(
      `supabase/config.toml: missing [functions.${n}] (add it, with verify_jwt)`,
    );
  for (const n of stale)
    console.error(
      `supabase/config.toml: [functions.${n}] has no supabase/functions/${n} directory`,
    );
  process.exit(1);
}
console.log(`Edge function config OK (${dirs.length} functions declared).`);
