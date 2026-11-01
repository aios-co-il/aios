import type { ComponentProps } from "react";
import { CardLogSystemSendsSwitch } from "../CardLogSystemSendsSwitch";
import {
  ManagerModeSection,
  type ManagerModeSectionProps,
} from "./ManagerModeSection";

type ManagerSettingsSectionsProps = {
  section: ManagerModeSectionProps | null;
  cardLog: ComponentProps<typeof CardLogSystemSendsSwitch> | null;
};

/** The manager settings of the alert rules dialog; each is null for a viewer the database would refuse (useManagerSettingsDraft). */
export function ManagerSettingsSections({
  section,
  cardLog,
}: ManagerSettingsSectionsProps) {
  return (
    <>
      {section && <ManagerModeSection {...section} />}
      {cardLog && <CardLogSystemSendsSwitch {...cardLog} />}
    </>
  );
}
