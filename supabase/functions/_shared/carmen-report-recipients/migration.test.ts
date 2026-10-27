import { assert, assertMatch, assertNotMatch } from "jsr:@std/assert@1";

const MIGRATION = new URL(
  "../../../migrations/20261027105000_carmen_report_recipients.sql",
  import.meta.url,
);

const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();

/** The carry-over DO block only. */
const carryOver = sql.slice(
  sql.indexOf("do $carry$"),
  sql.lastIndexOf("$carry$"),
);

Deno.test("carmen_report_recipients migration", async (t) => {
  await t.step(
    "carries campaign_pulse_phone into the list as an extra phone",
    () => {
      assertMatch(carryOver, /from public\.tenant_heartbeat_settings s/);
      assertMatch(
        carryOver,
        /insert into public\.carmen_report_recipients \(tenant_id, phone, label\)/,
      );
    },
  );

  await t.step("runs once per organization and is idempotent", () => {
    assertMatch(
      carryOver,
      /not exists \(\s*select 1 from public\.carmen_report_recipients r\s*where r\.tenant_id = pp\.tenant_id/,
    );
    assertMatch(carryOver, /on conflict \(tenant_id, phone\) do nothing/);
  });

  await t.step("skips client phones and says what it skipped", () => {
    assertMatch(
      carryOver,
      /not exists \(\s*select 1 from public\.clients c\s*where c\.tenant_id = pp\.tenant_id/,
    );
    assertMatch(carryOver, /raise notice/);
  });

  await t.step("keeps campaign_pulse_phone readable (no data loss)", () => {
    assertNotMatch(sql, /update public\.tenant_heartbeat_settings/);
    assertNotMatch(sql, /set campaign_pulse_phone/);
    assertNotMatch(sql, /drop column/);
  });

  await t.step("only owners write; staff read; anon gets nothing", () => {
    assertMatch(
      sql,
      /alter table public\.carmen_report_recipients enable row level security/,
    );
    assertMatch(
      sql,
      /for insert to authenticated\s*with check \(public\.carmen_is_tenant_owner\(tenant_id\)\)/,
    );
    assertMatch(
      sql,
      /for delete to authenticated\s*using \(public\.carmen_is_tenant_owner\(tenant_id\)\)/,
    );
    assertNotMatch(sql, /for update to authenticated/);
    assertMatch(
      sql,
      /revoke all on table public\.carmen_report_recipients from anon, authenticated/,
    );
    assertMatch(
      sql,
      /revoke all on function public\.carmen_report_staff\(uuid\) from public, anon, authenticated/,
    );
  });

  await t.step(
    "the guard trigger rejects client phones and non-staff users",
    () => {
      assertMatch(
        sql,
        /before insert or update on public\.carmen_report_recipients/,
      );
      assert(sql.includes("is a client phone of this organization"));
      assert(sql.includes("is not staff of this organization"));
    },
  );
});
