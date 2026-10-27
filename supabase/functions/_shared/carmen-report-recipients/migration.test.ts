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
    "carries campaign_pulse_phone as its one staff member, else an extra phone",
    () => {
      assertMatch(carryOver, /from public\.tenant_heartbeat_settings s/);
      assertMatch(
        carryOver,
        /cross join lateral public\.carmen_report_staff_rows\(e\.tenant_id\) st/,
      );
      assertMatch(carryOver, /having count\(\*\) = 1/);
      assertMatch(
        carryOver,
        /insert into public\.carmen_report_recipients \(tenant_id, user_id, phone, label\)/,
      );
    },
  );

  await t.step("runs once per organization and is idempotent", () => {
    assertMatch(
      carryOver,
      /not exists \(\s*select 1 from public\.carmen_report_recipients r\s*where r\.tenant_id = pp\.tenant_id/,
    );
    assertMatch(carryOver, /on conflict do nothing/);
  });

  await t.step(
    "skips client and client-contact phones and says what it skipped",
    () => {
      assertMatch(
        carryOver,
        /not public\.carmen_is_client_phone\(pp\.tenant_id, pp\.phone\)/,
      );
      assertMatch(carryOver, /raise notice/);
      assertMatch(
        sql,
        /from public\.clients c\s*where c\.tenant_id = p_tenant_id/,
      );
      assertMatch(
        sql,
        /from public\.client_contacts cc\s*where cc\.tenant_id = p_tenant_id/,
      );
    },
  );

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
    "the guard refuses non-owners before it reveals a client phone or staff",
    () => {
      assertMatch(
        sql,
        /before insert or update on public\.carmen_report_recipients/,
      );
      const owners = sql.indexOf("only owners of this organization may change");
      const client = sql.indexOf("is a client phone of this organization");
      const staff = sql.indexOf("is not staff of this organization");
      assert(owners > 0 && owners < client && client < staff);
    },
  );
});
