import { assert, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import {
  ECOMMERCE_PULSE_SKILL_ROW,
  PULSE_CHECK_SKILL_ROW,
} from "./pulse-skill-rows.ts";

const read = (path: string) =>
  Deno.readTextFileSync(new URL(path, import.meta.url));
const migration = read(
  "../../../migrations/20261026131000_carmen_pulse_refresh.sql",
);
const ROWS = [PULSE_CHECK_SKILL_ROW, ECOMMERCE_PULSE_SKILL_ROW];
const TEXT_FIELDS = [
  "name",
  "description",
  "goal",
  "system_prompt",
  "constraints",
  "steps",
  "output_template",
] as const;

/** A SQL text[] literal the way the migration spells it. */
const sqlArray = (values: readonly string[]) =>
  `ARRAY[${values.map((v) => `'${v}'`).join(", ")}]::text[]`;

Deno.test("pulse skill rows", async (t) => {
  await t.step(
    "the migration writes the same skin text as the registry fallback",
    () => {
      const registry = read("./registry.ts");
      assertMatch(
        registry,
        /fallbackFromSkillRow\(\s*PULSE_CHECK_SKILL_ROW,?\s*\)/,
      );
      assertMatch(
        registry,
        /fallbackFromSkillRow\(\s*ECOMMERCE_PULSE_SKILL_ROW,?\s*\)/,
      );
      for (const row of ROWS) {
        for (const field of TEXT_FIELDS) {
          const value = row[field];
          if (value === null) {
            continue;
          }
          assert(
            migration.includes(`$$${value}$$`),
            `${row.slug}.${field} matches the migration`,
          );
        }
        assert(migration.includes(sqlArray(row.allowed_tools)), row.slug);
        assert(migration.includes(sqlArray(row.triggers)), row.slug);
        assert(migration.includes(`'${row.slug}',\n  'global',`), row.slug);
      }
      assertMatch(
        migration,
        /ON CONFLICT \(slug\) WHERE scope = 'global' DO UPDATE/,
      );
      // Tenant overrides are counted, never updated.
      assertNotMatch(
        migration,
        /UPDATE public\.ai_skills[\s\S]*scope = 'tenant'/,
      );
    },
  );

  await t.step(
    "pulse_check keeps the client-call details of the live text",
    () => {
      const text = PULSE_CHECK_SKILL_ROW.system_prompt;
      assertMatch(text, /לא תועדה שיחה ב-14 הימים האחרונים/);
      assertMatch(text, /עדכון שבועי שאומר בחיוב.*נחשב שיחה/);
      assertMatch(text, /"לא הצלחתי לדבר" לא נחשב/);
    },
  );

  await t.step(
    "the migration inserts triggers sorted, so a re-run changes nothing",
    () => {
      for (const row of ROWS) {
        assert(
          migration.includes(
            `ARRAY(\n    SELECT DISTINCT phrase\n    FROM unnest(${sqlArray(row.triggers)}) AS phrase\n    ORDER BY phrase\n  ),`,
          ),
          row.slug,
        );
      }
    },
  );
});
