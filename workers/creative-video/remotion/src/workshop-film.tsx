import React from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { WORKSHOP_ACCENT, type WorkshopFilmProps } from "./manifest";
import { KaraokeCaptions } from "./workshop-captions";
import { FilmEndCard } from "./workshop-film-end";
import { FilmSound } from "./workshop-film-sound";
import { filmFontFamily, fontFaces } from "./workshop-fonts";
import { MotionCaptions } from "./workshop-motion-captions";
import { Picture, type TitleMode } from "./workshop-picture";
import { sceneHeadline } from "./workshop-scene-text";
import { SkinFlash } from "./workshop-skin";
import { endCardTiming, sceneTiming } from "./workshop-film-timing";
import { edgeFade } from "./workshop-transition";

export type {
  WorkshopFilmProps,
  WorkshopMove,
  WorkshopScene,
} from "./manifest";

export const WorkshopFilm: React.FC<WorkshopFilmProps> = ({
  scenes,
  narration,
  music,
  musicLoops,
  musicEnvelope,
  effects,
  effectsEnvelope,
  captions,
  captionStyle,
  brand,
  endCardFrames,
  font,
  endCardStyle,
  endCardBackground,
  endCardGlass,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const accent = brand?.primaryColor || WORKSHOP_ACCENT;
  const fontFamily = filmFontFamily(font, brand?.fontFamily);
  const spoken = (captions ?? []).filter((c) => c.words.length);
  // Motion graphics when the manifest asks for them; karaoke lines for older films.
  const motion = captionStyle === "motion";
  const title: TitleMode = !spoken.length ? "none" : motion ? "card" : "kicker";
  const { starts, cursor, enterOf } = sceneTiming(scenes);
  const pictures = scenes.map((scene, index) => {
    const start = starts[index];
    const enter = enterOf(index);
    const next = scenes[index + 1];
    // Over spoken captions the scene's text shows at the top unless its title or the
    // captions already show it; without them, as motion graphics (or, in a karaoke film, as
    // the scene's caption at the bottom).
    const caption = spoken.length
      ? sceneHeadline(
          scene,
          spoken,
          start - enter,
          start + scene.durationFrames,
        )
      : (scene.caption || "").trim();
    return (
      <Sequence
        key={scene.id}
        from={start - enter}
        durationInFrames={scene.durationFrames + enter}
      >
        <Picture
          scene={scene}
          enter={enter}
          exitFrames={next ? enterOf(index + 1) : 0}
          exitType={next?.transition}
          accent={accent}
          caption={caption}
          captionAt={spoken.length ? "top" : motion ? "motion" : "bottom"}
          title={title}
        />
      </Sequence>
    );
  });
  const endFrames = endCardFrames && brand ? endCardFrames : 0;
  const { endEnter, lastSceneFrom } = endCardTiming(scenes, endFrames);
  return (
    <AbsoluteFill
      style={{ background: "#07111c", fontFamily, fontSynthesis: "none" }}
    >
      <style>{fontFaces(staticFile)}</style>
      {pictures}
      {spoken.length && motion ? (
        <MotionCaptions
          captions={spoken}
          accent={accent}
          fontFamily={fontFamily}
        />
      ) : spoken.length ? (
        <KaraokeCaptions
          captions={spoken}
          accent={accent}
          fontFamily={fontFamily}
        />
      ) : null}
      {scenes.map((scene, index) => {
        const enter = enterOf(index);
        if (scene.transition !== "skin" || enter <= 0) return null;
        return (
          <Sequence
            key={`flash-${scene.id}`}
            from={starts[index] - enter}
            durationInFrames={enter + 8}
            layout="none"
          >
            <SkinFlash frames={enter} accent={accent} />
          </Sequence>
        );
      })}
      {endFrames && brand ? (
        <FilmEndCard
          brand={brand}
          endCardStyle={endCardStyle}
          endCardBackground={endCardBackground}
          endCardGlass={endCardGlass}
          accent={accent}
          fontFamily={fontFamily}
          lastScene={scenes.at(-1)}
          lastSceneFrom={lastSceneFrom}
          cursor={cursor}
          endFrames={endFrames}
          endEnter={endEnter}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background: "black",
          opacity: 1 - edgeFade(frame, durationInFrames, 10),
          pointerEvents: "none",
        }}
      />
      <FilmSound
        narration={narration}
        music={music}
        musicLoops={musicLoops}
        musicEnvelope={musicEnvelope}
        effects={effects}
        effectsEnvelope={effectsEnvelope}
      />
    </AbsoluteFill>
  );
};
