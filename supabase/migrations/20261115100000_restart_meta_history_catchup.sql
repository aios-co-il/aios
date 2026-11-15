-- Restart the scheduled history catch-up of the Meta report tables whose
-- history was deleted by the unbounded catch-up delete (fixed in #1377, now in
-- Production). Each of these active facebook_insights tables lost days between
-- 2026-06-21 and 2026-11-13 (read-only audit, 2026-11-15). Dropping the
-- scheduled_history_from marker makes cron-sync-facebook-insights walk the last
-- 120 days back again, one 21-day slice per run, and the bounded delete now
-- replaces only each slice's days. Google Ads tables wait for #1382, whose
-- Elementor lookback keeps verified leads on past slices.
-- Ids are pinned to the audited tables; Staging has none of them (no-op).
UPDATE public.crm_tables
SET integration_settings = integration_settings - 'scheduled_history_from'
WHERE id IN (
    '02062ce7-500f-4d2b-94b5-d9315bfcf2b3',
    '05a3ffbb-14d4-4f3b-a6b9-d46992079b7e',
    '05c7ea1b-cac2-438d-8838-ac237753baa0',
    '06224354-06ce-400f-9b3d-b106e49893c8',
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
    '4663e1dc-c434-4674-938d-b5381048e61f',
    '49e70fa3-7e68-4780-8f40-262bfa271121',
    '4c81bcc4-fb80-4b0c-9a67-41fe1d1b0745',
    '50668799-14f7-4d25-bdd6-627b3735137e',
    '531972ed-e36e-4005-b046-55c359d59d8b',
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
    '9ed27709-4ee4-4104-824b-c5a6841bcf92',
    '9ff0f54f-eb91-4bf1-bf94-138d67347c2a',
    'a4facc5d-757f-4919-adb2-31e11dbcb84e',
    'a5b52ee4-2b51-4209-b08a-ae5f9781a8de',
    'a71a52d9-1136-4213-bce2-d1fdbecb03ff',
    'a7583457-0d6d-4d0b-a991-5bf4b7d7c8d8',
    'aafc4924-c87b-48ba-8433-afa1749f780c',
    'b1c96e5e-d578-4827-8140-8dd8e1774022',
    'b2212c65-0405-448b-93dd-41483a94874d',
    'b6226d54-843f-429b-b0d8-62ce6311db9e',
    'c1bc908d-951a-417c-8ff2-3d3be9028a61',
    'c3e2edc1-a3ef-4ad8-90bd-1072f9fdc9b0',
    'c5f0a6b8-6641-4b63-b4a0-4f04a4c5c84b',
    'ccb8fbda-fd8f-4883-93e3-a59dc87563ab',
    'cd63cbf2-0d08-40db-afa7-8d4d7cc1d9bb',
    'd69396b0-b250-4a11-a027-5d41dda1eaa3',
    'dab49dab-a676-4f1f-86fb-20f49ba924f9',
    'e5eb5775-d629-4aa0-a03e-091c8ce6c840',
    'e81bf016-441d-4d72-8c29-49de37aa9c70',
    'e8894b77-0aad-40be-b732-8a11a05b78d8',
    'ed89582f-16d7-491d-bbd5-069e0cb141a9',
    'efc52000-bc3e-417c-be25-86669148780a',
    'f52ea89c-6084-4fdd-8986-fc68f62a133f',
    'fa72cbf3-ff47-46c1-ba40-d5eee7f2fae4'
  )
  AND integration_type = 'facebook_insights'
  AND campaign_active IS NOT FALSE
  AND integration_settings ? 'scheduled_history_from';
