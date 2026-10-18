"""Auth identity and integration parent rows that must exist before table imports."""
from .sql import IMPORT_GATE, batches, ident, json_sql, read_all


def ensure_identity_parents(api, referenced_users=()):
    # Keep production user IDs for RLS/FKs, without copying passwords, login
    # sessions, OAuth identities, MFA factors or recovery tokens. Existing
    # Staging accounts keep their authentication settings.
    users = read_all(api, "SELECT id, email, created_at FROM auth.users", source=True)
    for group in batches(users):
        api.query(f"""BEGIN; SET LOCAL lock_timeout='3s';
{IMPORT_GATE}
CREATE TEMP TABLE mirror_import_users ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset({json_sql(group)}) x(id uuid,email text,created_at timestamptz);
-- The existing signup trigger links invitations by email. An imported identity
-- must not activate an old Staging invitation or its permissions.
LOCK TABLE public.invitation_tokens IN SHARE MODE;
DO $invites$ BEGIN IF EXISTS(
 SELECT 1 FROM mirror_import_users x
 JOIN public.invitation_tokens i ON lower(i.email)=lower(x.email)
 WHERE NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=x.id)
) THEN RAISE EXCEPTION 'Pending Staging invitations require identity reconciliation'; END IF; END $invites$;
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
SELECT id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',email,created_at,now(),'{{}}'::jsonb,'{{}}'::jsonb
FROM mirror_import_users
ON CONFLICT(id) DO NOTHING; COMMIT;""")


    # Production can retain historical creator IDs after an Auth account was
    # removed. Retain those relations with non-login identities, never with a
    # copied email, password, OAuth identity, session or invitation grant.
    # profiles.email is NOT NULL on Staging; .invalid is deliberately unroutable.
    live_ids = {user['id'] for user in users}
    historical = [{'id': user_id} for user_id in referenced_users if user_id not in live_ids]
    for group in batches(historical):
        api.query(f"""BEGIN; SET LOCAL lock_timeout='3s';
{IMPORT_GATE}
CREATE TEMP TABLE mirror_historical_users ON COMMIT DROP AS
 SELECT id,'historical+'||id::text||'@staging.invalid' AS email
 FROM jsonb_to_recordset({json_sql(group)}) x(id uuid);
LOCK TABLE public.invitation_tokens IN SHARE MODE;
DO $historical$ BEGIN IF EXISTS(
 SELECT 1 FROM mirror_historical_users h JOIN public.invitation_tokens i ON lower(i.email)=h.email
 WHERE NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=h.id)
) THEN RAISE EXCEPTION 'Historical Staging identity matches an invitation'; END IF; END $historical$;
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at,banned_until,raw_app_meta_data,raw_user_meta_data)
SELECT id,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',email,now(),now(),'2999-12-31'::timestamptz,
 '{{"staging_historical_reference":true}}'::jsonb,'{{}}'::jsonb
FROM mirror_historical_users
ON CONFLICT(id) DO NOTHING; COMMIT;""")


def referenced_auth_users(api, tables):
    allowed = {table['name'] for table in tables}
    edges = api.query("""SELECT child.relname AS child,a.attname AS column
FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
JOIN pg_namespace n ON n.oid=child.relnamespace
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='auth.users'::regclass
AND cardinality(c.conkey)=1""")
    queries = [f"SELECT {ident(edge['column'])} AS id FROM public.{ident(edge['child'])} WHERE {ident(edge['column'])} IS NOT NULL"
               for edge in edges if edge['child'] in allowed]
    if not queries: return []
    return [row['id'] for row in read_all(api, ' UNION '.join(queries), source=True)]


def ensure_integration_parents(api):
    # Insert metadata for newly created connections so client/report relations
    # remain valid. Preserve existing Staging credentials and endpoint settings.
    # Keep personal ownership: dropping user_id changes the connection scope
    # and violates the unique index for tenant-wide connections.
    data = read_all(api, "SELECT id,tenant_id,user_id,integration_type,connection_visibility,display_name,created_at,shared_from_integration_id FROM public.tenant_integrations", source=True)
    api.query(f"""BEGIN; SET LOCAL lock_timeout='3s';
{IMPORT_GATE}
INSERT INTO public.tenant_integrations(id,tenant_id,user_id,integration_type,connection_visibility,display_name,created_at,shared_from_integration_id,is_active,auto_sync_enabled,settings)
SELECT id,tenant_id,user_id,integration_type,connection_visibility,display_name,created_at,shared_from_integration_id,false,false,'{{}}'::jsonb
FROM jsonb_populate_recordset(NULL::public.tenant_integrations,{json_sql(data)})
ON CONFLICT(id) DO NOTHING; COMMIT;""")
