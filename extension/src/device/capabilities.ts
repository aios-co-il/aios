/**
 * What the panel tells the site it can do. The device tools are announced only while tab
 * sharing is on: without the tab's address the panel cannot name the site to ask for, so
 * it would refuse every step.
 */
import type { DeviceToolName } from "../../../supabase/functions/_shared/carmen/device/contract.ts";
import {
  panelCapabilities,
  type PanelMessage,
} from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";

/** The device tools this build runs. */
const DEVICE_CAPABILITIES: ReadonlyArray<DeviceToolName> = [
  "browser_read_page",
  "browser_navigate",
  "browser_click",
  "browser_type",
  "browser_screenshot",
];

/** The capabilities message for the current tab-sharing state. */
export function capabilitiesMessage(tabShared: boolean): PanelMessage {
  return panelCapabilities(
    tabShared ? ["tab-context", ...DEVICE_CAPABILITIES] : undefined,
  );
}
