// The chat under test for the browser-step tests, framed by a panel or not. Each test file
// mocks the chat's backend itself (vi.mock is per file); CarmenChatBar.deviceSend.test-fixture.ts
// opens it and sends a message.
import type { ScreenContextMetadata } from "@/lib/systemFixContext";
import { CarmenChatBar } from "./CarmenChatBar";
import type { PanelChannel } from "./device/panelStep";
import { useBrainChannel } from "./useBrainChannel";

const TENANT = "tenant-a";

/** The chat, framed by a panel or not, beside the tab the panel shares. */
export function Chat({
  panel,
  tab = null,
}: {
  panel: PanelChannel | null;
  tab?: ScreenContextMetadata | null;
}) {
  const brain = useBrainChannel(TENANT);

  return (
    <CarmenChatBar
      tenantId={TENANT}
      brain={brain}
      onFaceState={() => {}}
      audioLevelRef={{ current: 0 }}
      mode="sidecar"
      startFresh
      browserPanel={panel}
      contextMetadata={tab}
    />
  );
}
