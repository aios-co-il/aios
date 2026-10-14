// Remotion composition for one promo. The worker feeds it the same timeline
// as the ffmpeg assembly (`buildTimeline`). Hebrew titles are drawn here;
// the ffmpeg path keeps picture, voice and music and leaves the titles to this pass.
import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "remotion";

export type PromoScene = {
  id: string;
  clipSrc: string;
  voiceSrc?: string | null;
  overlayText?: string;
  durationS: number;
};

export type PromoProps = {
  scenes: PromoScene[];
  musicSrc?: string | null;
};

export const promoDurationInFrames = (props: PromoProps, fps: number) =>
  Math.max(
    1,
    props.scenes.reduce(
      (sum, scene) => sum + Math.round(scene.durationS * fps),
      0,
    ),
  );

export const PromoFilm = ({ scenes, musicSrc }: PromoProps) => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {scenes.map((scene) => {
        const duration = Math.max(1, Math.round(scene.durationS * 25));
        const from = cursor;
        cursor += duration;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={duration}>
            <AbsoluteFill>
              <OffthreadVideo src={scene.clipSrc} />
              {scene.voiceSrc ? <Audio src={scene.voiceSrc} /> : null}
              {scene.overlayText ? (
                <div
                  style={{
                    position: "absolute",
                    left: 48,
                    right: 48,
                    bottom: 72,
                    color: "white",
                    fontSize: 42,
                    fontWeight: 700,
                    textAlign: "center",
                    direction: "rtl",
                    textShadow: "0 2px 12px rgba(0,0,0,0.7)",
                  }}
                >
                  {scene.overlayText}
                </div>
              ) : null}
            </AbsoluteFill>
          </Sequence>
        );
      })}
      {musicSrc ? <Audio src={musicSrc} volume={0.18} /> : null}
    </AbsoluteFill>
  );
};
