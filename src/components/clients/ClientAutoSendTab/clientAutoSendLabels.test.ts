import { describe, expect, it } from "vitest";
import { Constants } from "@/integrations/supabase/types";
import { CLIENT_SEND_REFUSALS } from "../../../../supabase/functions/_shared/client-send/types.ts";
import {
  AUTO_SEND_KIND_LABELS,
  AUTO_SEND_TARGET_LABELS,
  CLIENT_AUTO_SEND_KINDS,
  CLIENT_AUTO_SEND_TARGETS,
  MISSING_TARGET_HINTS,
  REFUSAL_LABELS,
  refusalLabel,
  refusalStatusLabel,
} from "./clientAutoSendLabels";

describe("clientAutoSendLabels", () => {
  it("lists the database's kinds and targets", () => {
    expect(CLIENT_AUTO_SEND_KINDS).toEqual(
      Constants.public.Enums.client_auto_send_kind,
    );
    expect(CLIENT_AUTO_SEND_TARGETS).toEqual(
      Constants.public.Enums.client_auto_send_target,
    );
  });

  it("names every kind and target, and says what a missing target lacks", () => {
    for (const kind of CLIENT_AUTO_SEND_KINDS) {
      expect(AUTO_SEND_KIND_LABELS[kind]).toBeTruthy();
    }
    for (const target of CLIENT_AUTO_SEND_TARGETS) {
      expect(AUTO_SEND_TARGET_LABELS[target]).toBeTruthy();
      expect(MISSING_TARGET_HINTS[target]).toBeTruthy();
    }
  });

  it("names every refusal the guard logs", () => {
    expect(Object.keys(REFUSAL_LABELS).sort()).toEqual(
      [...CLIENT_SEND_REFUSALS].sort(),
    );
    expect(refusalLabel("not_opted_in")).toBe("לא אושר בכרטיס");
    expect(refusalLabel("unclassified_service_send")).toBe(
      "שליחה אוטומטית לא מסווגת",
    );
  });

  it("shows a reason newer than this build as stored", () => {
    expect(refusalLabel("future_reason")).toBe("future_reason");
  });

  it("tells a blocked send from one only logged", () => {
    expect(refusalStatusLabel(true)).toBe("נחסם");
    expect(refusalStatusLabel(false)).toBe("ייחסם כשההגנה תופעל");
  });
});
