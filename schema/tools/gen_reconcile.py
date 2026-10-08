"""Generate the Staging reconcile: Staging schema -> production baseline + catch-up.

Inputs (scratchpad): objs_cmp.json (target DB dump vs Staging-copy dump, same pg_dump),
objs_as.json (prod vs Staging auth/storage dumps), objs_cu.json (catch-up file), acl_diff.json.
"""
import json, re, sys

SP = sys.argv[1]
cmp_ = json.load(open(f'{SP}/objs_cmp.json'))
T, S, TR, SR = cmp_['prod'], cmp_['staging'], cmp_['prod_raw'], cmp_['staging_raw']
AS = json.load(open(f'{SP}/objs_as.json'))
CU = json.load(open(f'{SP}/objs_cu.json'))
ACL = json.load(open(f'{SP}/acl_diff.json'))

# Real storage policy definitions: prod's dump plus the catch-up's.
STORAGE_TARGET_RAW = {k: v for k, v in AS['prod_raw'].items() if k.startswith('POLICY storage.')}
STORAGE_TARGET_RAW.update({k: v for k, v in CU['prod_raw'].items() if k.startswith('POLICY storage.')})


def keep(k):
    return 'environment_sync' in k or 'agent_collaboration_' in k


def q(name):
    return '"' + name.replace('"', '""') + '"'


def qual(dotted):
    return '.'.join(q(p) for p in dotted.split('.'))


def end(stmt):
    stmt = re.sub(r'^CREATE (FUNCTION|PROCEDURE|TRIGGER) ', r'CREATE OR REPLACE \1 ', stmt.strip())
    return stmt.rstrip(';') + ';\n'


s_only = [k for k in S if k not in T and not keep(k)]
t_only = [k for k in T if k not in S]
differ = [k for k in T if k in S and T[k] != S[k]]

out = []


def section(title):
    out.append(f'\n-- {title}\n')


def name_from_raw(raw, kind):
    pat = {'POLICY': r'CREATE POLICY ("(?:[^"]|"")+"|\S+)',
           'TRIGGER': r'CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER ("(?:[^"]|"")+"|\S+)',
           'INDEX': r'CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?("(?:[^"]|"")+"|\S+)',
           'CONSTRAINT': r'ADD CONSTRAINT ("(?:[^"]|"")+"|\S+)'}[kind]
    m = re.search(pat, raw)
    n = m.group(1)
    return n if n.startswith('"') else q(n)


def table_of(k):
    # 'POLICY public.tbl :: name' / 'CONSTRAINT public.tbl.name' / 'COLUMN public.tbl.col'
    body = k.split(' ', 1)[1]
    if ' :: ' in body:
        return body.split(' :: ')[0]
    return '.'.join(body.split('.')[:2])


def split_top(argstr):
    parts, depth, cur, inq = [], 0, '', False
    for ch in argstr:
        if ch == "'":
            inq = not inq
        if not inq:
            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
            elif ch == ',' and depth == 0:
                parts.append(cur.strip()); cur = ''; continue
        cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def func_sig(raw):
    m = re.match(r'CREATE (?:OR REPLACE )?(?:FUNCTION|PROCEDURE) ("?[\w]+"?\."?[\w]+"?)\s*\((.*?)\) RETURNS', ' '.join(raw.split()), re.S)
    args = [re.split(r' DEFAULT ', a, flags=re.I)[0] for a in split_top(m.group(2))]
    return f'{m.group(1)}({", ".join(args)})'


def is_fk(v):
    return v.lstrip().upper().startswith('FOREIGN KEY')


def policy_name_and_table(k, raw):
    return name_from_raw(raw, 'POLICY'), qual(table_of(k))


# ---------------------------------------------------------------------------
out.append('''-- Staging reconcile: bring Staging's schema to the production baseline plus the catch-up
-- (20261009000000_production_baseline.sql + 20261009000100_catchup_shipped_schema.sql).
-- Run ONCE, by hand, on Staging only. Then repair Staging's migration history so both files
-- count as applied.
--
-- Keeps every row. Staging-only tables stay: environment_sync.* and agent_collaboration_*.
-- Drops Staging-only policies, triggers, functions, constraints, indexes and the column
-- agent_tasks.next_run (unused by code). Converts column types to prod's.
--
-- Known residual drift, left on purpose:
-- - lead_status keeps Staging's extra value 'negotiation' (Postgres cannot drop an enum value
--   without rebuilding the type; no code uses it).
-- - automation_action lists its values in a different order (sorting only).
-- - Cron jobs are untouched; they get their own migration.

BEGIN;

-- Refuse to run anywhere but Staging: only Staging has the environment_sync schema.
DO $$
BEGIN
  IF to_regclass('environment_sync.safety') IS NULL THEN
    RAISE EXCEPTION 'This is not Staging (environment_sync.safety is missing). Aborting.';
  END IF;
END $$;

SET LOCAL check_function_bodies = false;
''')

# ---------------------------------------------------------------- drops
section('1. Drop Staging-only and changed policies')
for k in s_only + differ:
    if k.startswith('POLICY'):
        raw = SR[k] if not k.startswith('POLICY storage.') else AS['staging_raw'][k]
        n, tbl = policy_name_and_table(k, raw)
        out.append(f'DROP POLICY IF EXISTS {n} ON {tbl};\n')

section('2. Drop Staging-only and changed triggers')
for k in s_only + differ:
    if k.startswith('TRIGGER'):
        out.append(f'DROP TRIGGER IF EXISTS {name_from_raw(SR[k], "TRIGGER")} ON {qual(table_of(k))};\n')

section('3. Drop Staging-only and changed constraints (foreign keys first)')
cons = [k for k in s_only + differ if k.startswith('CONSTRAINT')]
for k in sorted(cons, key=lambda k: 0 if is_fk(S[k]) else 1):
    cname = k.split(' ', 1)[1].split('.', 2)[2]
    raw = SR[k]
    n = name_from_raw(raw, 'CONSTRAINT') if 'ADD CONSTRAINT' in raw else q(cname)
    out.append(f'ALTER TABLE {qual(table_of(k))} DROP CONSTRAINT IF EXISTS {n};\n')

section('4. Drop Staging-only and changed indexes')
for k in s_only + differ:
    if k.startswith('INDEX'):
        schema = table_of(k).split('.')[0]
        out.append(f'DROP INDEX IF EXISTS {q(schema)}.{name_from_raw(SR[k], "INDEX")};\n')

section('5. Drop Staging-only functions')
for k in s_only:
    if k.startswith('FUNCTION'):
        out.append(f'DROP FUNCTION IF EXISTS {func_sig(SR[k])};\n')

section('6. Drop the Staging-only column (unused by code)')
for k in s_only:
    if k.startswith('COLUMN'):
        tbl, col = table_of(k), k.split('.')[-1]
        out.append(f'ALTER TABLE {qual(tbl)} DROP COLUMN IF EXISTS {q(col)};\n')

section('7. Realtime publication: remove tables prod does not publish')
for k in s_only:
    m = re.match(r'OTHER ALTER PUBLICATION supabase_realtime ADD TABLE ONLY (\S+)', k)
    if m:
        out.append(f'ALTER PUBLICATION "supabase_realtime" DROP TABLE {qual(m.group(1))};\n')

section('8. carmen_memory_outbox: prod does not tie the id sequence to the column')
out.append('ALTER SEQUENCE "public"."carmen_memory_outbox_id_seq" OWNED BY NONE;\n')

# ---------------------------------------------------------------- columns
section('9. Convert columns to prod\'s types, defaults and nullability')
USING = {
    'public.agent_tasks.task_skills': 'to_jsonb("task_skills")',
    'public.clients.services': 'to_jsonb("services")',
    'public.clients.tier': '"tier"::text',
    'public.communication_logs.status': '"status"::text',
    'public.communication_logs.interaction_type': '"interaction_type"::text',
    'public.social_media_posts.media_urls': 'pg_temp.jsonb_to_text_array("media_urls")',
}
out.append('''CREATE FUNCTION pg_temp.jsonb_to_text_array(j jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS
$$ SELECT CASE WHEN j IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(j)) END $$;
''')


def parse_col(v):
    notnull = v.endswith(' NOT NULL')
    v = v[:-9] if notnull else v
    m = re.match(r'(.*?)(?: DEFAULT (.*))?$', v, re.S)
    return m.group(1).strip(), m.group(2), notnull


for k in differ:
    if not k.startswith('COLUMN'):
        continue
    full = k.split(' ', 1)[1]
    tbl, col = '.'.join(full.split('.')[:2]), full.split('.')[2]
    tt, td, tn = parse_col(T[k])
    st, sd, sn = parse_col(S[k])
    a = f'ALTER TABLE {qual(tbl)} ALTER COLUMN {q(col)}'
    dropped = tt != st or sd != td
    if dropped:
        out.append(f'{a} DROP DEFAULT;\n')
    if tt != st:
        using = USING.get(full, f'{q(col)}::{tt}')
        out.append(f'{a} TYPE {tt} USING {using};\n')
    if td is not None and dropped:
        out.append(f'{a} SET DEFAULT {td};\n')
    if tn and not sn:
        out.append(f'{a} SET NOT NULL;\n')
    if sn and not tn:
        out.append(f'{a} DROP NOT NULL;\n')

# ---------------------------------------------------------------- creates
section('10. Types that prod has and Staging lacks')
for k in t_only:
    if k.startswith('TYPE'):
        out.append(end(TR[k]))

section('11. Tables that prod has and Staging lacks')
new_tables = [k.split(' ', 1)[1] for k in t_only if k.startswith('TABLE')]
for k in t_only:
    if k.startswith('TABLE'):
        out.append(end(TR[k]))

section('12. Columns that prod has and Staging lacks')
for k in t_only:
    if k.startswith('COLUMN') and table_of(k) not in new_tables:
        tbl, col = table_of(k), k.split('.')[-1]
        out.append(f'ALTER TABLE {qual(tbl)} ADD COLUMN IF NOT EXISTS {q(col)} {T[k]};\n')

section('13. Functions: prod\'s definitions')
new_funcs = []
for k in t_only + differ:
    if k.startswith('FUNCTION'):
        if k in t_only:
            new_funcs.append(k)
        out.append(end(TR[k]))

section('14. Constraints that prod has (keys and checks first, then foreign keys)')
cons = [k for k in t_only + differ if k.startswith('CONSTRAINT') and table_of(k) not in new_tables]
cons_new = [k for k in t_only if k.startswith('CONSTRAINT') and table_of(k) in new_tables and 'ADD CONSTRAINT' in TR[k]]
for k in sorted(cons + cons_new, key=lambda k: 1 if is_fk(T[k]) else 0):
    raw = TR[k]
    if 'ADD CONSTRAINT' in raw:
        out.append(end(raw))
    else:  # check constraint written inline in CREATE TABLE on prod
        cname = k.split(' ', 1)[1].split('.', 2)[2]
        out.append(f'ALTER TABLE {qual(table_of(k))} ADD CONSTRAINT {q(cname)} {T[k]};\n')

section('15. Indexes that prod has')
for k in t_only + differ:
    if k.startswith('INDEX'):
        out.append(end(TR[k]))

section('16. Triggers that prod has')
for k in t_only + differ:
    if k.startswith('TRIGGER'):
        out.append(end(TR[k]))

section('17. Row level security on the new tables')
for k in t_only:
    if k.startswith('OTHER') and 'ENABLE ROW LEVEL SECURITY' in k:
        out.append(end(TR[k]))

section('18. Policies that prod has')
for k in t_only + differ:
    if k.startswith('POLICY'):
        raw = STORAGE_TARGET_RAW[k] if k.startswith('POLICY storage.') else TR[k]
        out.append(end(raw))

section('19. Comments: prod\'s text, or none')
for k in set(t_only + differ + [k for k in s_only if k.startswith('COMMENT')]):
    if not k.startswith('COMMENT'):
        continue
    if k in T:
        out.append(end(TR[k]))
    else:
        raw = SR[k]
        if any(k.endswith(c.split(' ', 1)[1].lower()) for c in s_only if c.startswith('COLUMN')):
            continue  # its column was dropped
        m = re.match(r'(COMMENT ON .*?) IS ', ' '.join(raw.split()), re.S)
        out.append(f'{m.group(1)} IS NULL;\n')

section('20. Grants: match prod')
out.append('-- New objects first lose the grants Supabase adds by default, then get exactly prod\'s.\n')
for k in new_tables:
    out.append(f'REVOKE ALL ON TABLE {qual(k)} FROM PUBLIC, "anon", "authenticated", "service_role";\n')
for k in new_funcs:
    out.append(f'REVOKE ALL ON FUNCTION {func_sig(TR[k])} FROM PUBLIC, "anon", "authenticated", "service_role";\n')
    sig = func_sig(TR[k])
    revoked = any(a.startswith('ACL REVOKE ALL ON FUNCTION') and 'FROM PUBLIC' in a and a.split(' ON FUNCTION ')[1].startswith(sig.split('(')[0])
                  and sig.split('(')[0] in a for a in ACL['target_only'])
    if not revoked:
        out.append(f'GRANT EXECUTE ON FUNCTION {sig} TO PUBLIC;\n')
for a in ACL['staging_only']:
    stmt = a[4:]
    if any(f in stmt for f in ['client_is_seo_tagged', 'merge_client_records', 'notify_client_follow_up_worker',
                                'notify_task_assigned', 'user_can_view_client', 'user_can_view_task']):
        continue  # dropped above
    m = re.match(r'GRANT (.*) ON (.*) TO (\S+)$', stmt)
    if m:
        out.append(f'REVOKE {m.group(1)} ON {m.group(2)} FROM {m.group(3)};\n')
        continue
    m = re.match(r'REVOKE ALL ON (FUNCTION .*) FROM PUBLIC$', stmt)
    out.append(f'GRANT EXECUTE ON {m.group(1)} TO PUBLIC;\n')
for a in ACL['target_only']:
    out.append(end(a[4:]))

out.append('\nCOMMIT;\n')
sys.stdout.write(''.join(out))
