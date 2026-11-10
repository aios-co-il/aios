import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetCarmenSkins } from "../../executors/get-carmen-skins.ts";
import { executeRecallSkills } from "../../executors/recall-skills.ts";
import { executeCreateSkill } from "../../executors/create-skill.ts";
import { executeUpdateSkill } from "../../executors/update-skill.ts";

/** skill-tool tool routes; argument assertions retain the legacy tool boundary. */
export const skillToolRoutes: Record<string, ToolRoute> = {
  get_carmen_skins: bindToolRoute(executeGetCarmenSkins),
  recall_skills: bindToolRoute(executeRecallSkills),
  create_skill: bindToolRoute(executeCreateSkill),
  update_skill: bindToolRoute(executeUpdateSkill),
};
