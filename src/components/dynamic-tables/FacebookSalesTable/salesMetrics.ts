import { perUnit } from "../facebookMetrics";

/** Purchase value per unit of spend; null without spend. */
export const roas = perUnit("purchase_value", "spend");

/** Spend per purchase; null without purchases. */
export const costPerPurchase = perUnit("spend", "purchases");
