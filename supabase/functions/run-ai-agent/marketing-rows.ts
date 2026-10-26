import { Constants } from "../_shared/database.types.ts";
import {
  isJson,
  isNamedRelation,
  isString,
  matchesFields,
  nullable,
  oneOf,
} from "./row-guards.ts";
import type { MarketingWorkItemListRow } from "./tool-contracts-marketing.ts";

const optionalText = nullable(isString);

const MARKETING_WORK_ITEM_LIST_FIELDS = {
  id: isString,
  title: optionalText,
  status: oneOf(Constants.public.Enums.marketing_item_status),
  target_channel: optionalText,
  client_id: optionalText,
  pipeline_id: optionalText,
  current_stage_id: optionalText,
  payload: isJson,
  updated_at: isString,
  clients: isNamedRelation,
};

/** `clients(name)` has no FK behind it in the generated schema, so rows arrive untyped. */
export function isMarketingWorkItemListRow(
  value: unknown,
): value is MarketingWorkItemListRow {
  return matchesFields(value, MARKETING_WORK_ITEM_LIST_FIELDS);
}
