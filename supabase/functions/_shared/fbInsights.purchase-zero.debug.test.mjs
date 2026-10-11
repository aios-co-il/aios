import assert from 'node:assert/strict'
import test from 'node:test'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildInsightRecord } from './fbInsights.ts'

const LOG = '/opt/cursor/logs/debug.log'
mkdirSync(dirname(LOG), { recursive: true })

const captured = []
globalThis.__fbInsightsDebug = (payload) => {
  captured.push(payload)
  appendFileSync(LOG, JSON.stringify(payload) + '\n')
}

const salesStatus = {
  sale: {
    id: 'sale',
    name: 'SmartAir - Genesis - מכירות',
    objective: 'OUTCOME_SALES',
    effective_status: 'ACTIVE',
    configured_status: 'ACTIVE',
  },
}
const goals = { sale: 'OFFSITE_CONVERSIONS' }

function row(actions, extra = {}) {
  return buildInsightRecord(
    {
      date_start: '2026-10-07',
      campaign_id: 'sale',
      campaign_name: 'SmartAir - Genesis - מכירות',
      spend: '100',
      impressions: '1000',
      clicks: '40',
      actions,
      ...extra,
    },
    salesStatus,
    {},
    goals,
  )
}

test('H1 website purchase action onsite_web_purchase is ignored', () => {
  const built = row([
    { action_type: 'onsite_web_purchase', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '34' },
  ])
  assert.equal(built.result_kind, 'purchases')
  assert.equal(built.purchases, 0)
  assert.equal(built.leads, 34)
  assert.equal(captured.at(-1).hypothesisId, 'A')
  assert.equal(captured.at(-1).data.presentWebsiteTypes[0].type, 'onsite_web_purchase')
  assert.equal(captured.at(-1).data.presentWebsiteTypes[0].count, 3)
})

test('H2 zero omni_purchase shadows a real pixel purchase', () => {
  const built = row([
    { action_type: 'omni_purchase', value: '0' },
    { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
  ])
  assert.equal(built.purchases, 0)
  assert.deepEqual(captured.at(-1).data.chosenPurchaseTypes, ['omni_purchase'])
  assert.equal(captured.at(-1).hypothesisId, 'A')
})

test('H3 custom pixel event is counted as leads, not purchases', () => {
  const built = row([
    { action_type: 'offsite_conversion.fb_pixel_custom.Purchase', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '31' },
  ])
  assert.equal(built.purchases, 0)
  // Custom children and fb_pixel_lead are MAX'd, so the purchase-like custom event never becomes purchases.
  assert.equal(built.leads, 31)
  assert.equal(captured.at(-1).hypothesisId, 'D')
  assert.equal(captured.at(-1).data.customPurchaseLike[0].count, 3)
})

test('H5 attribution bucket without value is dropped', () => {
  const built = row([
    { action_type: 'omni_purchase', '7d_click': '3' },
  ])
  assert.equal(built.purchases, 0)
})

test('control: omni_purchase value is counted', () => {
  const before = captured.length
  const built = row([
    { action_type: 'omni_purchase', value: '3' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '34' },
  ])
  assert.equal(built.purchases, 3)
  assert.equal(built.leads, 34)
  assert.equal(captured.length, before)
})
