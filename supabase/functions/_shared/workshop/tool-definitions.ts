import { EDIT_TOOL } from "./edit-tool.ts";
import { CREATIVE_TOOLS } from "./tool-definitions-creative.ts";
import { PRODUCE_VIDEO_TOOL } from "./tool-definitions-produce.ts";
import { PROJECT_TOOLS } from "./tool-definitions-project.ts";
import { SAVE_SCRIPT_TOOL } from "./tool-definitions-script.ts";
import { UPDATE_SCENE_TOOL } from "./tool-definitions-scene.ts";
import { MAKE_STILLS_TOOL } from "./tool-definitions-stills.ts";
import { STORYBOARD_TOOL } from "./tool-definitions-storyboard.ts";
import { VOICE_TOOL } from "./voice-tool.ts";

export const WORKSHOP_SKIN = "carmen_workshop";

export const WORKSHOP_TOOLS = [
  EDIT_TOOL,
  VOICE_TOOL,
  ...PROJECT_TOOLS,
  ...CREATIVE_TOOLS,
  SAVE_SCRIPT_TOOL,
  STORYBOARD_TOOL,
  UPDATE_SCENE_TOOL,
  MAKE_STILLS_TOOL,
  PRODUCE_VIDEO_TOOL,
];

export const isWorkshopTool = (name: string) =>
  WORKSHOP_TOOLS.some((tool) => tool.name === name);
