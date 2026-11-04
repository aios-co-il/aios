/** A scene's text over its picture: the overlay graphics, its caption or motion title, its title. */
import React from "react";
import { type WorkshopScene } from "./manifest";
import { SceneCaption } from "./workshop-captions";
import { Kicker } from "./workshop-kicker";
import { MotionTitle } from "./workshop-motion-title";
import { SceneOverlayView } from "./workshop-overlay";
import { type TitleMode } from "./workshop-picture";
import { TitleCard } from "./workshop-title-card";

export const SceneTextLayer: React.FC<{
  scene: WorkshopScene;
  enter: number;
  accent: string;
  caption: string;
  captionAt: "top" | "bottom" | "motion";
  title: TitleMode;
  kicker: string;
}> = ({ scene, enter, accent, caption, captionAt, title, kicker }) => (
  <>
    {scene.overlay && scene.overlay !== "none" ? (
      <SceneOverlayView
        overlay={scene.overlay}
        sceneId={scene.id}
        enter={enter}
        accent={accent}
        hasText={Boolean(caption) || captionAt === "top"}
      />
    ) : null}
    {!caption ? null : captionAt === "motion" ? (
      <MotionTitle
        text={caption}
        enter={enter}
        accent={accent}
        style={scene.titleStyle ?? "float"}
        size={scene.titleSize ?? "medium"}
        emphasis={scene.titleEmphasis ?? "none"}
      />
    ) : (
      <SceneCaption
        text={caption}
        enter={enter}
        accent={accent}
        at={captionAt}
      />
    )}
    {kicker && title === "kicker" ? (
      <Kicker text={kicker} enter={enter} accent={accent} />
    ) : null}
    {kicker && title === "card" ? (
      <TitleCard text={kicker} enter={enter} accent={accent} />
    ) : null}
  </>
);
