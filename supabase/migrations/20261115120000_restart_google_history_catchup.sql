-- Restart the scheduled history catch-up of the Google Ads report tables whose
-- history was deleted by the unbounded catch-up delete (fixed in #1377). Each
-- of these active google_ads tables lost days between 2026-06-30 and
-- 2026-11-01 (read-only audit, 2026-11-15). Dropping the scheduled_history_from
-- marker makes the Google Ads cron walk the last 120 days back again, one slice
-- per run. The bounded delete replaces only each slice's days, and since #1382
-- a past slice keeps its verified leads (Elementor lookback from the slice
-- start, stored counts carried for days it cannot reach).
-- Ids are pinned to the audited tables; Staging has none of them (no-op).
UPDATE public.crm_tables
SET integration_settings = integration_settings - 'scheduled_history_from'
WHERE id IN (
    '0148f441-86d1-4439-82b8-0d95b612ed84',
    '04ff4d71-716f-4470-be8c-98dc5e76a687',
    '06b21c45-d9c0-4e93-8282-3c5fac5f7e6b',
    '09393c0b-927c-4d5c-a31b-a59459be1344',
    '0b92f59b-e4dd-4e7a-82c4-c48468e59e42',
    '1f3dbd23-d278-4b6c-9347-13eac6397b76',
    '20752b14-93f2-49da-83cb-3e0332ca092a',
    '278606d9-d920-4031-a692-d6fea74fed39',
    '3714f880-341e-4a67-b4d3-8439529f42cd',
    '38f0e650-e3e3-4fcc-9700-1426c1b3e0ef',
    '3bcf4243-e9ed-43fb-ba84-69e0557463d1',
    '455d490b-649a-4769-bef6-d7275fa2f6fb',
    '58187df4-a4da-438d-bc5f-1a91a06b026c',
    '5d2462af-096f-4254-bff3-1400da6a7342',
    '60fe227b-91c9-4d0f-be93-35725e145c4e',
    '6f58796d-ff04-4782-8406-6dcb9d2b2149',
    '75b69841-d3fa-4db0-b421-99e89dedbb97',
    '793ff23a-4005-45fc-a32b-03597d422d75',
    '8603da96-fc25-4a13-affc-9f6ca8d52221',
    '862ec613-9ab2-4ac1-82af-509aef09ec8a',
    '8772b01d-236c-468c-aa5e-53ebb32d3e4d',
    '8d71f89d-9170-40c2-88c7-93de6ecb5641',
    '945cc8eb-45d0-4521-a9f9-4b1b2acbd6e5',
    '9956cb10-80b2-4b20-9092-1c62cb2ac992',
    'a041e482-89fb-4bfb-a7d4-df111c2c5214',
    'a49120e6-85d1-4e1e-9036-0b86b7d421d8',
    'a8f36fa9-ce88-4e87-92ea-b142d0526355',
    'b256ce92-3805-41d0-9456-040770ccff54',
    'b54574c5-b8dc-410e-a079-e8ed6b399b8c',
    'cc909817-aee9-4679-8f6e-39bd66291721',
    'cde4f7d1-370d-42c4-a0a8-ea4d09d6ab1f',
    'cf8643d0-892c-42b2-a585-0a3a1af72638',
    'd66bcc05-fd0a-42a0-979f-d23dd7e4a4eb',
    'e0c66bf0-8e9a-43af-84ed-38657258d2f4',
    'e1cdf38f-b560-4602-bd35-5bf6aaf314b6',
    'e38a3d2f-fcf4-464d-8fb1-526a4fec04ba',
    'e59a220a-9c79-486b-a46a-a9970070367f',
    'ea39e5c5-c741-49ba-b287-f41955602969',
    'ebcf4c20-8a78-4f98-9d04-be2cb4524e69',
    'ee996b83-c1dc-4192-8818-f4e0d50e936c',
    'f3e9f07b-c1ef-4dba-8b5d-4d072bedd580',
    'f969b202-6ed4-4d0e-af3e-35a6c8bf8433',
    'fa71148f-d85b-43d6-be06-57ed3b13e74c',
    'faff8b58-9b79-46eb-8ad3-a03a22f9c270',
    'fc331dde-f4c5-49bf-bc4b-8775d5b0aaea',
    'fc8099b4-bec8-4307-bbde-bd853781a3fb'
  )
  AND integration_type = 'google_ads'
  AND campaign_active IS NOT FALSE
  AND integration_settings ? 'scheduled_history_from';
