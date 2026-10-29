/** Frame sizes, timing units and staged file names shared by the Remotion manifest's parts. */

export const WORKSHOP_FPS = 30;
export const TAIL_FRAMES = 15;

const FRAME = {
  "16:9": [1920, 1080],
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
};

const SAFE_EXT = new Set(
  "png jpg jpeg webp svg mp4 webm mov wav mp3 m4a".split(" "),
);

export const workshopFrameSize = (aspect) => FRAME[aspect] ?? FRAME["9:16"];

export const extension = (path) => {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String(path).split(/[?#]/, 1)[0]);
  const ext = (match?.[1] || "").toLowerCase();
  return SAFE_EXT.has(ext) ? ext : "bin";
};

export const seconds = (value) => (Number(value) > 0 ? Number(value) : 0);
export const lastEnd = (words) => words.reduce((n, w) => Math.max(n, w.end), 0);
