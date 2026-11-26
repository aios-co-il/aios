-- One-off backfill of 2026-06-30..2026-07-17 for the ads report tables whose
-- history the unbounded catch-up delete removed (fixed in #1377). The restarted
-- scheduled catch-up (20261115100000, 20261115120000) only reaches today-120
-- days, so these 18 days would never come back. The marker makes
-- cron-sync-facebook-insights / cron-sync-google-ads fetch this one window
-- through the bounded write (only its days are replaced) on the next run that
-- has no catch-up slice, then clear it (history-backfill.ts).
-- Ids: the two restart migrations' lists, read-only Production audit
-- (2026-11-25), keeping active tables that had campaign rows in 2026-06-01..06-29
-- or in the window itself. Dropped: 5 switched-off Meta tables, 3 Meta and
-- 1 Google table with no campaign rows before 2026-07-22 at all.
-- Staging has none of these tables (no-op).
UPDATE public.crm_tables
SET integration_settings = integration_settings
  || jsonb_build_object(
    'history_backfill',
    jsonb_build_object('start', '2026-06-30', 'end', '2026-07-17')
  )
WHERE (
    (
      integration_type = 'facebook_insights'
      AND id IN (
        '02062ce7-500f-4d2b-94b5-d9315bfcf2b3',
        '05a3ffbb-14d4-4f3b-a6b9-d46992079b7e',
        '05c7ea1b-cac2-438d-8838-ac237753baa0',
        '06a817f0-f827-430e-870e-6940c5d7c915',
        '1277ac47-193b-4782-a9ba-e23bf23f3a06',
        '136edb3c-f0e2-4cd5-aabc-80910ed7c999',
        '17cada03-871e-4554-8fb5-67bed8c5cac9',
        '188c57aa-4428-4e0e-b162-c241cad6b908',
        '1c51ec4e-569e-4e3b-901a-ce4ba9c31a77',
        '207542af-40c1-498c-ac34-e4741df44b54',
        '23a7e989-5a19-4761-a631-05fc8c5f012b',
        '23ae8e0f-6454-437e-8e81-c4e55d77d184',
        '279038e6-4566-43b4-a210-a341ab5fb2e8',
        '2876a8a4-40b1-462e-94a1-c236d322922d',
        '29d13d06-7906-4f68-9699-4b3b3b6fad31',
        '2c2b41d6-781f-4fa7-8de9-f8d6dda9568b',
        '34611522-134e-46c3-af18-5d09a1d73d5c',
        '39c04334-e4f7-46e2-a0a5-258795098a00',
        '49e70fa3-7e68-4780-8f40-262bfa271121',
        '4c81bcc4-fb80-4b0c-9a67-41fe1d1b0745',
        '50668799-14f7-4d25-bdd6-627b3735137e',
        '53d0f854-fbc8-462f-8c55-a58876951c96',
        '5851261d-90f7-40ac-8536-633856ce4412',
        '615cf18a-e07d-4a87-95ad-ac3738c1acd1',
        '61f371d7-ffec-4061-b6d6-360f03f5b4a2',
        '61ff4051-f9c8-4314-ad01-c13df869e861',
        '620abbc7-104b-46cf-bcd8-1766205f596e',
        '62663f56-6b1f-4d18-9b84-9b4d69b9d4d6',
        '6644bf2b-6d22-4f91-8d0a-9094f8e4b324',
        '6665673c-644c-4384-9456-320fd329d0d8',
        '676b14da-ba52-407c-a6cf-c6cb9cb97efa',
        '6e65d4cb-25de-4ffc-bb74-49461ac7f567',
        '6f303b93-2787-41d5-90eb-4be634845fdf',
        '6f60d62a-dc6d-44d8-a204-ac8f5aea09fa',
        '7258af11-800b-430f-8d4f-68ea3204db06',
        '73e3e3e3-2d67-451f-8631-b9b88b6c8bbb',
        '7585b89a-0d5a-4e87-8a9f-5534db69ff42',
        '79dc14c9-cc78-4aa9-a131-f882051189e5',
        '802d9459-2df0-4d61-b414-26ee5798f019',
        '81f198c5-eb52-42df-8e86-e0b8dc7dc055',
        '86540a9d-8a59-40d9-a755-fa4014cedeb9',
        '87f0dac7-2365-4044-89d4-ae3314d124d1',
        '9496d116-827f-435d-a224-53a27cadddb1',
        '95e9e658-8e61-456b-9913-9c70f06f94f8',
        '9ff0f54f-eb91-4bf1-bf94-138d67347c2a',
        'a4facc5d-757f-4919-adb2-31e11dbcb84e',
        'a5b52ee4-2b51-4209-b08a-ae5f9781a8de',
        'a71a52d9-1136-4213-bce2-d1fdbecb03ff',
        'a7583457-0d6d-4d0b-a991-5bf4b7d7c8d8',
        'b1c96e5e-d578-4827-8140-8dd8e1774022',
        'b6226d54-843f-429b-b0d8-62ce6311db9e',
        'c1bc908d-951a-417c-8ff2-3d3be9028a61',
        'c3e2edc1-a3ef-4ad8-90bd-1072f9fdc9b0',
        'ccb8fbda-fd8f-4883-93e3-a59dc87563ab',
        'cd63cbf2-0d08-40db-afa7-8d4d7cc1d9bb',
        'd69396b0-b250-4a11-a027-5d41dda1eaa3',
        'dab49dab-a676-4f1f-86fb-20f49ba924f9',
        'e5eb5775-d629-4aa0-a03e-091c8ce6c840',
        'e81bf016-441d-4d72-8c29-49de37aa9c70',
        'e8894b77-0aad-40be-b732-8a11a05b78d8',
        'ed89582f-16d7-491d-bbd5-069e0cb141a9',
        'f52ea89c-6084-4fdd-8986-fc68f62a133f',
        'fa72cbf3-ff47-46c1-ba40-d5eee7f2fae4'
      )
    )
    OR (
      integration_type = 'google_ads'
      AND id IN (
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
        'fc331dde-f4c5-49bf-bc4b-8775d5b0aaea'
      )
    )
  )
  AND campaign_active IS NOT FALSE
  AND NOT integration_settings ? 'history_backfill';
