/** Rows and requests for the trusted-site tests of carmen-device-action (trust.ts). */
import {
  ACTION,
  actionRow,
  answer,
  CLAIM,
  ME,
  post,
  RUN,
  TENANT,
  world,
} from "./handler.test-fixture.ts";

export const CONVERSATION = "77777777-7777-4777-8777-777777777777";
export const OTHER_CONVERSATION = "88888888-8888-4888-8888-888888888888";
export const SHOP = "https://shop.example";
export const SHOP_PAGE = { origin: SHOP, path: "/form" };
const ACTED = { ...SHOP_PAGE, title: "Form", changed: false };

/** A new pending click of mine in the conversation. */
export function click() {
  return actionRow({
    tool: "browser_click",
    arguments: { snapshot_id: "s1", ref: "e1" },
    conversation_id: CONVERSATION,
  });
}

/** The run's read of a page on `origin`. */
export function readOf(origin: string, id = crypto.randomUUID()) {
  return {
    id,
    tenant_id: TENANT,
    user_id: ME,
    run_id: RUN,
    tool: "browser_read_page",
    status: "done",
    observed_origin: origin,
  };
}

/** My trust of `origin` in `conversation`. */
export function trustOf(
  origin: string,
  conversation = CONVERSATION,
  overrides = {},
) {
  return {
    tenant_id: TENANT,
    user_id: ME,
    conversation_id: conversation,
    origin,
    ...overrides,
  };
}

/** The claim's answer about trust. */
export async function claimedTrust(
  action: Record<string, unknown>,
  options: Parameters<typeof world>[1],
) {
  const { deps } = world(action, options);
  const { body } = await answer(post(CLAIM), deps);
  return {
    trusted_origin: body.trusted_origin,
    conversation_id: body.conversation_id,
  };
}

/** A completion of the claimed click that ran after a card on the shop's form. */
export function tappedDone(trust_origin?: unknown) {
  return {
    action: "complete",
    id: ACTION,
    status: "done",
    decision: "ask",
    observed: SHOP_PAGE,
    result: ACTED,
    ...(trust_origin === undefined ? {} : { trust_origin }),
  };
}
