import React from "react";
import { Sequence } from "remotion";
import type { WorkshopCaption } from "./manifest";
import { KaraokeLine } from "./workshop-caption-lines";

export { SceneCaption } from "./workshop-caption-lines";

/** Karaoke-style Hebrew captions: the spoken word lights up in the brand colour. */
export const KaraokeCaptions: React.FC<{
  captions: WorkshopCaption[];
  accent: string;
  fontFamily: string;
}> = ({ captions, accent, fontFamily }) => (
  <>
    {captions.map((caption) => (
      <Sequence
        key={`caption-${caption.startFrame}`}
        from={caption.startFrame}
        durationInFrames={Math.max(1, caption.endFrame - caption.startFrame)}
        layout="none"
      >
        <KaraokeLine
          caption={caption}
          accent={accent}
          fontFamily={fontFamily}
        />
      </Sequence>
    ))}
  </>
);
