/**
 * The server's card rule for a device step (AIO-656): the contract's `deviceCardRule` on the
 * reported tab or a navigation's destination, with what only the server knows. The panel
 * rules again on the tab's real address; here only `never` refuses.
 */
import { deviceCardRule } from "../../_shared/carmen/device/card-rule.ts";
import type { DeviceToolName } from "../../_shared/carmen/device/contract.ts";
import type { EnvironmentOrigins } from "../../_shared/carmen/device/never-controllable.ts";

/**
 * The card rule for the step on one page (the reported tab, or a navigation's
 * destination), or `configuration` when the contract throws on this environment's
 * settings: logged, and the step is refused.
 */
export function cardRule(
  tool: DeviceToolName,
  url: string,
  origins: EnvironmentOrigins,
  facts: { tainted: boolean; permission: boolean },
): string {
  try {
    return deviceCardRule({
      tool,
      url,
      trusted: false,
      tainted: facts.tainted,
      origins,
      // The tenant's own floor hosts arrive with the act tools (AIO-656).
      addedActNeverHosts: [],
      // Unknown on the server. Only `never` refuses here, and the tighter answer turns
      // nothing else into one, but for a picture it would refuse every page for a user
      // without the permission: the panel reads the page's fields and rules on those, so
      // the server refuses the picture only where it can see (the act floor).
      sensitivePage: tool !== "browser_screenshot",
      sensitiveScreenshotsAllowed: facts.permission,
    });
  } catch (error) {
    console.error(
      `[device] ${tool} refused: the card rule cannot be read`,
      error,
    );
    return "configuration";
  }
}
