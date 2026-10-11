import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FB_INSIGHTS_FIELD_KEYS,
  FB_INSIGHTS_FIELD_NAMES,
  FB_INSIGHTS_FIELD_TYPES,
  buildCampaignOptimizationGoalMap,
  buildInsightRecord,
  buildResultMetricMaps,
  latestCampaignUpdatedTime,
  resolveCampaignResultMetric,
} from './fbInsights.ts'

const smartAirStatuses = {
  '120245057091170127': {
    id: '120245057091170127',
    name: 'SmartAir - Genesis - מכירות',
    objective: 'OUTCOME_SALES',
    effective_status: 'ACTIVE',
    configured_status: 'ACTIVE',
  },
  '120253026062570127': {
    id: '120253026062570127',
    name: 'SmartAir - Genesis - שווקי חג המולד',
    objective: 'OUTCOME_SALES',
    effective_status: 'ACTIVE',
    configured_status: 'ACTIVE',
  },
}
const smartAirAdsets = [
  { id: 'as-checkout', campaign_id: '120245057091170127', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: 'p', custom_event_type: 'INITIATED_CHECKOUT' } },
  { id: 'as-purchase', campaign_id: '120253026062570127', optimization_goal: 'OFFSITE_CONVERSIONS', promoted_object: { pixel_id: 'p', custom_event_type: 'PURCHASE' } },
]
const smartAirGoals = { '120245057091170127': 'OFFSITE_CONVERSIONS', '120253026062570127': 'OFFSITE_CONVERSIONS' }

function smartAirRow(campaignId, actions, extra = {}) {
  return buildInsightRecord(
    {
      date_start: '2026-10-07',
      campaign_id: campaignId,
      campaign_name: smartAirStatuses[campaignId].name,
      spend: '629',
      actions,
      ...extra,
    },
    smartAirStatuses,
    {},
    smartAirGoals,
    buildResultMetricMaps(smartAirAdsets),
  )
}

test('sales campaign optimized for Initiate Checkout reports checkouts as its result', () => {
  const row = smartAirRow('120245057091170127', [
    { action_type: 'initiate_checkout', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_initiate_checkout', value: '3' },
    { action_type: 'onsite_web_initiate_checkout', value: '3' },
    { action_type: 'omni_initiated_checkout', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '34' },
  ])
  assert.equal(row.campaign_type, 'ecommerce')
  assert.equal(row.result_kind, 'initiate_checkout')
  assert.equal(row.result_label, 'התחלות תשלום')
  assert.equal(row.results, 3)
  assert.equal(row.purchases, 0)
  assert.equal(row.leads, 34)
})

test('purchase-optimized campaign keeps purchases as result and does not borrow checkouts', () => {
  const row = smartAirRow('120253026062570127', [
    { action_type: 'initiate_checkout', value: '1' },
    { action_type: 'omni_initiated_checkout', value: '1' },
  ])
  assert.equal(row.result_kind, 'purchases')
  assert.equal(row.result_label, 'רכישות')
  assert.equal(row.results, 0)
  assert.equal(row.purchases, 0)
})

test('purchase result counts onsite_web_purchase and stays deduplicated', () => {
  const row = smartAirRow('120253026062570127', [
    { action_type: 'onsite_web_purchase', value: '1' },
    { action_type: 'offsite_conversion.fb_pixel_purchase', value: '1' },
  ])
  assert.equal(row.result_kind, 'purchases')
  assert.equal(row.results, 1)
})

test('ad set rows use their own configured metric', () => {
  const row = smartAirRow(
    '120245057091170127',
    [{ action_type: 'omni_initiated_checkout', value: '2' }],
    { adset_id: 'as-checkout', adset_name: 'Genesis checkout' },
  )
  assert.equal(row.entity_level, 'adset')
  assert.equal(row.result_kind, 'initiate_checkout')
  assert.equal(row.results, 2)
})

test('lead and custom-event ad sets keep the existing lead result path', () => {
  assert.equal(resolveCampaignResultMetric({ custom_event_type: 'LEAD' }), null)
  assert.equal(resolveCampaignResultMetric({ custom_event_type: 'OTHER', custom_event_str: 'NewLead' }), null)
  assert.equal(resolveCampaignResultMetric({ custom_conversion_id: '123' }), null)
  assert.equal(resolveCampaignResultMetric({ custom_event_type: 'ADD_TO_CART' }).kind, 'add_to_cart')
})

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

test('latest campaign updated_time is flushed from the campaign object', () => {
  assert.equal(
    latestCampaignUpdatedTime({
      a: { id: 'a', name: 'A', effective_status: 'ACTIVE', configured_status: 'ACTIVE', updated_time: '2026-09-17T08:00:00+0000' },
      b: { id: 'b', name: 'B', effective_status: 'ACTIVE', configured_status: 'ACTIVE', updated_time: '2026-09-18T10:30:00+0000' },
    }),
    '2026-09-18T10:30:00+0000',
  )
})
