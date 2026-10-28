-- Ops (read-only): agency_tenant_access rows the share chain does not back
-- (AIO-234). Needs 20261026095300 (tenant_holds_agency). Run on Staging, or on
-- Production through an approved read.
--   source_never_held: the source tenant does not hold the agency. The row
--     lets no article name the agency's clients, but it still gives the
--     accessing tenant's people access through
--     user_has_cross_tenant_agency_access and the helpers built on it.
--   write_from_read_only: a read_write row whose source holds the agency
--     only read_only.
-- Expected: no rows. Whether to keep or remove any row listed is David's call
-- (AIO-234); this query changes nothing.
SELECT
  CASE
    WHEN NOT public.tenant_holds_agency(ata.source_tenant_id, ata.agency_id, false)
      THEN 'source_never_held'
    ELSE 'write_from_read_only'
  END AS problem,
  ag.name AS agency,
  agency_tenant.name AS agency_tenant,
  source_tenant.name AS source_tenant,
  accessing_tenant.name AS accessing_tenant,
  ata.access_level,
  ata.created_at,
  ata.notes,
  ata.id
FROM public.agency_tenant_access ata
JOIN public.agencies ag ON ag.id = ata.agency_id
LEFT JOIN public.tenants agency_tenant ON agency_tenant.id = ag.tenant_id
JOIN public.tenants source_tenant ON source_tenant.id = ata.source_tenant_id
JOIN public.tenants accessing_tenant ON accessing_tenant.id = ata.accessing_tenant_id
WHERE NOT public.tenant_holds_agency(ata.source_tenant_id, ata.agency_id, false)
   OR (ata.access_level = 'read_write'
       AND NOT public.tenant_holds_agency(ata.source_tenant_id, ata.agency_id, true))
ORDER BY problem, agency, source_tenant, accessing_tenant;
