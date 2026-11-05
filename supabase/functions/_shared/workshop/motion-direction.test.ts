import { assertStrictEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  directedMotionRefusal,
  fashionMotion,
  isCarmenScene,
  MOTION_DIRECTION_SUMMARY,
} from "./motion-direction.ts";
import { planSceneUpdate } from "./scene-update.ts";
import { UPDATE_SCENE_TOOL } from "./tool-definitions-scene.ts";

const carmen = (motion: string) => ({
  visual_prompt: "Carmen at her desk",
  motion_prompt: motion,
});

describe("motion-direction", () => {
  it("finds fashion phrasing in a Carmen scene", () => {
    for (const [motion, word] of [
      ["She strikes a pose.", "strikes a pose"],
      ["She strikes pose by the window.", "strikes pose"],
      ["She poses for the camera.", "poses for the camera"],
      ["She is posing to camera.", "posing to camera"],
      ["Carmen is posing by the window.", "posing"],
      ["She does a hair flip.", "hair flip"],
      ["She flips her hair.", "flips her hair"],
      ["She tosses her hair.", "tosses her hair"],
      ["She twirls once.", "twirls"],
      ["She spins around.", "spins around"],
      ["Spinning on her chair.", "Spinning"],
      ["A runway walk to the lens.", "runway"],
      ["Catwalk steps.", "Catwalk"],
      ["A model walk past the desk.", "model walk"],
      ["She walks toward the camera.", "walks toward the camera"],
      ["She turns around to the window.", "turns around"],
    ]) {
      assertStrictEquals(fashionMotion(carmen(motion)), word, motion);
    }
  });

  it("lets end poses, figures of speech and object spins through", () => {
    for (const motion of [
      "Slow push-in. She taps the chart and holds the pose.",
      "She turns the laptop toward the viewer and ends posed at the desk.",
      "She explains with a small open-palm gesture and ends in a relaxed pose.",
      "The chart poses a question on the screen beside her.",
      "Beside her, a 3D model of the sneaker spins.",
      "On her wrist, the watch face spins.",
    ]) {
      assertStrictEquals(fashionMotion(carmen(motion)), null, motion);
    }
  });

  it("judges Carmen only, never a client's model", () => {
    const client = {
      visual_prompt: "a fashion model in the new dress on a studio set",
      motion_prompt: "The model poses in the new dress and strikes a pose.",
      speaker: "Dana",
    };
    assertStrictEquals(isCarmenScene(client), false);
    assertStrictEquals(fashionMotion(client), null);
    // "model" and "face" alone are not Carmen, nor a person.
    assertStrictEquals(
      isCarmenScene({
        motion_prompt: "The model of the watch face turns around.",
      }),
      false,
    );
    for (const scene of [
      { visual_prompt: "כרמן ליד השולחן" },
      { speaker: "Carmen" },
      {
        reference_url: "https://app.aios.co.il/brand/carmen/skins/analyst.webp",
      },
      { reference_url: "https://p.supabase.co/sign/t1/agent-avatars/x.png" },
      { skin_switch: true },
    ]) {
      const posing = { ...scene, motion_prompt: "She strikes a pose." };
      assertStrictEquals(
        fashionMotion(posing),
        "strikes a pose",
        JSON.stringify(scene),
      );
    }
  });

  it("refuses the first posing scene by its number", () => {
    const refusal = directedMotionRefusal([
      carmen("She nods."),
      carmen("She nods."),
      carmen("She strikes a pose."),
    ]);
    assertStringIncludes(String(refusal?.error), "סצנה 3:");
    assertStrictEquals(directedMotionRefusal([carmen("She nods.")]), null);
  });

  it("refuses posing motion in one scene's change too", () => {
    const scene = {
      id: "s-2",
      position: 2,
      visual_prompt: "Carmen at her desk",
    };
    const refused = planSceneUpdate(scene, { motion_prompt: "She twirls." });
    assertStringIncludes("error" in refused ? refused.error : "", "סצנה 2:");
    const fine = planSceneUpdate(scene, { motion_prompt: "She nods once." });
    assertStrictEquals("error" in fine, false);
    assertStringIncludes(
      String(UPDATE_SCENE_TOOL.parameters.properties.motion_prompt.description),
      MOTION_DIRECTION_SUMMARY,
    );
  });

  it("refuses a new picture description that makes the scene's motion Carmen's", () => {
    const scene = {
      id: "s-3",
      position: 3,
      visual_prompt: "a woman in a red dress on a studio set",
      motion_prompt: "She strikes a pose.",
    };
    const refused = planSceneUpdate(scene, {
      visual_prompt: "Carmen in a red dress in the office",
    });
    assertStringIncludes("error" in refused ? refused.error : "", "סצנה 3:");
    const client = planSceneUpdate(scene, {
      visual_prompt: "a woman in a blue dress on a studio set",
    });
    assertStrictEquals("error" in client, false);
    // An unrelated change leaves a client's posing scene alone.
    assertStrictEquals(
      "error" in planSceneUpdate(scene, { title: "Look 2" }),
      false,
    );
  });
});
