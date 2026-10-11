import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FB_INSIGHTS_FIELD_KEYS,
  FB_INSIGHTS_FIELD_NAMES,
  FB_INSIGHTS_FIELD_TYPES,
  buildCampaignOptimizationGoalMap,
  buildInsightRecord,
  latestCampaignUpdatedTime,
  resolveResultLeadTypes,
} from './fbInsights.ts'

test('Facebook CRM field definitions stay aligned', () => {
  assert.equal(FB_INSIGHTS_FIELD_KEYS.length, FB_INSIGHTS_FIELD_NAMES.length)
  assert.equal(FB_INSIGHTS_FIELD_KEYS.length, FB_INSIGHTS_FIELD_TYPES.length)
})

test('dominant optimization goal is retained per campaign', () => {
  assert.deepEqual(
    buildCampaignOptimizationGoalMap([
      { campaign_id: 'c1', optimization_goal: 'THRUPLAY' },
      { campaign_id: 'c1', optimization_goal: 'THRUPLAY' },
      { campaign_id: 'c1', optimization_goal: 'LINK_CLICKS' },
      { campaign_id: 'c2', optimization_goal: null },
    ]),
    { c1: 'THRUPLAY' },
  )
})

test('messaging objective is synced as engagement with an exact conversation outcome', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-09-17',
      campaign_id: 'c1',
      campaign_name: 'Messages',
      spend: '50',
      impressions: '1000',
      reach: '800',
      frequency: '1.25',
      clicks: '30',
      actions: [
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '8' },
        { action_type: 'messaging_conversation_started_7d', value: '8' },
      ],
    },
    {
      c1: {
        id: 'c1',
        name: 'Messages',
        objective: 'OUTCOME_ENGAGEMENT',
        effective_status: 'ACTIVE',
        configured_status: 'ACTIVE',
      },
    },
    {},
    { c1: 'CONVERSATIONS' },
  )

  assert.equal(row.campaign_type, 'lead')
  assert.equal(row.optimization_goal, 'CONVERSATIONS')
  assert.equal(row.result_kind, 'conversations')
  assert.equal(row.results, 8)
  assert.equal(row.conversations, 8)
  assert.equal(row.reach, 800)
  assert.equal(row.frequency, 1.25)
})

test('WhatsApp engagement campaign syncs as lead not traffic', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-09-17',
      campaign_id: 'wa',
      campaign_name: 'מעורבות | 18.8 - וואטסאפ',
      spend: '250',
      impressions: '8950',
      inline_link_clicks: '394',
      clicks: '394',
      actions: [
        { action_type: 'link_click', value: '394' },
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' },
      ],
    },
    {
      wa: {
        id: 'wa',
        name: 'מעורבות | 18.8 - וואטסאפ',
        objective: 'OUTCOME_ENGAGEMENT',
        effective_status: 'ACTIVE',
        configured_status: 'ACTIVE',
      },
    },
    {},
    { wa: 'LINK_CLICKS' },
  )

  assert.equal(row.campaign_type, 'lead')
  assert.equal(row.conversations, 12)
})

test('sales objective stores purchase results for pulse classification', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-09-17',
      campaign_id: 'sale',
      campaign_name: 'קמפיין מכירות | מבצעים ספטמבר',
      spend: '462.60',
      actions: [{ action_type: 'omni_purchase', value: '2' }],
      action_values: [{ action_type: 'omni_purchase', value: '1200' }],
    },
    {
      sale: {
        id: 'sale',
        name: 'קמפיין מכירות | מבצעים ספטמבר',
        objective: 'OUTCOME_SALES',
        effective_status: 'ACTIVE',
        configured_status: 'ACTIVE',
      },
    },
    {},
    { sale: 'OFFSITE_CONVERSIONS' },
  )

  assert.equal(row.campaign_type, 'ecommerce')
  assert.equal(row.campaign_objective, 'OUTCOME_SALES')
  assert.equal(row.result_kind, 'purchases')
  assert.equal(row.purchases, 2)
})

test('sales objective with incidental messaging stays ecommerce', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-10-05',
      campaign_id: 'sale2',
      campaign_name: 'יוני 26 | מכירות',
      spend: '203.13',
      actions: [
        { action_type: 'omni_purchase', value: '4' },
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '1' },
      ],
      action_values: [{ action_type: 'omni_purchase', value: '900' }],
    },
    {
      sale2: {
        id: 'sale2',
        name: 'יוני 26 | מכירות',
        objective: 'OUTCOME_SALES',
        effective_status: 'ACTIVE',
        configured_status: 'ACTIVE',
      },
    },
    {},
    { sale2: 'OFFSITE_CONVERSIONS' },
  )

  assert.equal(row.campaign_type, 'ecommerce')
  assert.equal(row.result_kind, 'purchases')
})

const leadCampaign = (id, name, objective = 'OUTCOME_LEADS') => ({
  [id]: {
    id,
    name,
    objective,
    effective_status: 'ACTIVE',
    configured_status: 'ACTIVE',
  },
})

test('call-optimized campaign counts placed calls as leads, not confirm clicks', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-10-08',
      campaign_id: 'us',
      campaign_name: 'ארצות הברית | קמפיין שיחות',
      spend: '1014.03',
      impressions: '29939',
      clicks: '460',
      actions: [
        { action_type: 'lead', value: '1' },
        { action_type: 'click_to_call_native_call_placed', value: '44' },
        { action_type: 'click_to_call_native_20s_call_connect', value: '20' },
        { action_type: 'click_to_call_call_confirm', value: '60' },
      ],
    },
    leadCampaign('us', 'ארצות הברית | קמפיין שיחות'),
    { us: ['click_to_call_native_call_placed'] },
    { us: 'QUALITY_CALL' },
  )

  assert.equal(row.leads, 44)
  assert.equal(row.campaign_type, 'lead')
  assert.equal(row.result_kind, 'leads')
  assert.equal(row.results, 44)
  assert.ok(Math.abs(row.cost_per_lead - (1014.03 / 44)) < 0.001)
})

test('lead campaign with only call events counts those calls as leads', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-10-08',
      campaign_id: 'cruise',
      campaign_name: '2027 קמפיין קרוז',
      spend: '521.72',
      impressions: '11435',
      clicks: '468',
      actions: [
        { action_type: 'click_to_call_native_call_placed', value: '24' },
        { action_type: 'click_to_call_call_confirm', value: '30' },
      ],
    },
    leadCampaign('cruise', '2027 קמפיין קרוז'),
  )

  assert.equal(row.leads, 24)
  assert.equal(row.campaign_type, 'lead')
  assert.equal(row.cost_per_lead, 521.72 / 24)
})

test('form lead campaign stays on form submissions when calls were not placed', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-10-08',
      campaign_id: 'sport',
      campaign_name: 'קמפיין נופש לידים - ספורט',
      spend: '699.90',
      impressions: '19358',
      clicks: '507',
      actions: [
        { action_type: 'lead', value: '33' },
        { action_type: 'leadgen_grouped', value: '33' },
        { action_type: 'click_to_call_call_confirm', value: '10' },
      ],
    },
    leadCampaign('sport', 'קמפיין נופש לידים - ספורט'),
    { sport: ['leadgen_grouped', 'leadgen.other', 'onsite_conversion.lead_grouped'] },
    { sport: 'LEAD_GENERATION' },
  )

  assert.equal(row.leads, 33)
  assert.equal(row.form_leads, 33)
})

test('placed calls are added to form leads when the campaign is not call-optimized', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-10-08',
      campaign_id: 'mix',
      campaign_name: 'לידים ושיחות',
      spend: '100',
      actions: [
        { action_type: 'leadgen_grouped', value: '10' },
        { action_type: 'click_to_call_native_call_placed', value: '4' },
        { action_type: 'click_to_call_native_20s_call_connect', value: '2' },
      ],
    },
    leadCampaign('mix', 'לידים ושיחות'),
    {},
    { mix: 'LEAD_GENERATION' },
  )

  assert.equal(row.leads, 14)
})

test('connected-call count is the fallback when placed calls are missing', () => {
  const row = buildInsightRecord(
    {
      date_start: '2026-10-08',
      campaign_id: 'conn',
      campaign_name: 'שיחות',
      spend: '80',
      actions: [{ action_type: 'click_to_call_native_20s_call_connect', value: '8' }],
    },
    leadCampaign('conn', 'שיחות'),
  )

  assert.equal(row.leads, 8)
})

test('call optimization resolves to calls placed ahead of a pixel event', () => {
  assert.deepEqual(
    resolveResultLeadTypes(
      { custom_event_type: 'LEAD', pixel_id: 'p1' },
      'QUALITY_CALL',
      'OUTCOME_LEADS',
    ),
    ['click_to_call_native_call_placed'],
  )
})

test('latest campaign updated_time is flushed from the campaign object', () => {
  assert.equal(
    latestCampaignUpdatedTime({
      a: { id: 'a', name: 'A', effective_status: 'ACTIVE', configured_status: 'ACTIVE', updated_time: '2026-09-17T08:00:00+0000' },
      b: { id: 'b', name: 'B', effective_status: 'ACTIVE', configured_status: 'ACTIVE', updated_time: '2026-09-18T10:30:00+0000' },
    }),
    '2026-09-18T10:30:00+0000',
  )
})
