import { assertStrictEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { directedMotionRefusal, fashionMotion } from "./motion-direction.ts";
import { planSceneUpdate } from "./scene-update.ts";
import { UPDATE_SCENE_TOOL } from "./tool-definitions-scene.ts";

const person = (motion: string) => ({
  visual_prompt: "Carmen at her desk",
  motion_prompt: motion,
});

describe("motion-direction", () => {
  it("finds fashion posing in a person scene", () => {
    for (const [motion, word] of [
      ["She poses for the camera.", "poses"],
      ["Carmen is posing by the window.", "posing"],
      ["She does a hair flip.", "hair flip"],
      ["She flips her hair.", "flips her hair"],
      ["She twirls once.", "twirls"],
      ["She spins around.", "spins"],
      ["A runway walk to the lens.", "runway"],
      ["Catwalk steps.", "Catwalk"],
      ["A model walk past the desk.", "model walk"],
    ]) {
      assertStrictEquals(fashionMotion(person(motion)), word, motion);
    }
  });

  it("lets professional motion, end poses and product spins through", () => {
    for (const motion of [
      "Slow push-in. She taps the chart. Ends in a calm end pose, eyes on the screen.",
      "She turns the laptop toward the viewer; final pose: hand on the desk.",
      "She explains the purpose with a small open-palm gesture, composed.",
    ]) {
      assertStrictEquals(fashionMotion(person(motion)), null, motion);
    }
    const product = {
      visual_prompt: "a perfume bottle on glass",
      motion_prompt: "The bottle spins slowly.",
    };
    assertStrictEquals(fashionMotion(product), null);
    // A talking scene has a person even when the words do not say so.
    assertStrictEquals(fashionMotion({ ...product, lipsync: true }), "spins");
  });

  it("refuses the first posing scene by its number", () => {
    const refusal = directedMotionRefusal([
      person("She nods."),
      person("She nods."),
      person("She strikes a pose."),
    ]);
    assertStringIncludes(String(refusal?.error), "סצנה 3:");
    assertStrictEquals(directedMotionRefusal([person("She nods.")]), null);
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
      "MOTION DIRECTION",
    );
  });
});
