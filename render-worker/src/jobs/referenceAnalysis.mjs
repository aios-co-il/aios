import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import {
  costOfUsage,
  describeShots,
  proposeStoryboard,
  transcribe,
} from "../analysis.mjs";
import { detectCuts, extractAudio, extractFrame, probe } from "../ffmpeg.mjs";
import { buildShots, keyframeTime, shotTranscript } from "../shots.mjs";

const MAX_SECONDS = 180;

/** Reads the project brief the proposal should be written for. */
async function loadBrief(db, run) {
  const [item] = await db.select(
    "marketing_work_items",
    `id=eq.${run.item_id}&select=title,client_id,payload`,
  );
  const payload = item?.payload ?? {};
  let client = null;
  if (item?.client_id) {
    [client] = await db.select(
      "clients",
      `id=eq.${item.client_id}&select=name,industry,website`,
    );
  }
  return [
    client &&
      `Client: ${client.name}${client.industry ? ` (${client.industry})` : ""}${client.website ? ` · ${client.website}` : ""}`,
    item?.title && `Project: ${item.title}`,
    payload.brief_text && `Brief: ${payload.brief_text}`,
    payload.copy_text && `Copy: ${String(payload.copy_text).slice(0, 2000)}`,
    run.input?.goal && `Goal: ${run.input.goal}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Reference video → shots (ffmpeg scene cuts), keyframes, transcript, shot descriptions
 * and a proposed storyboard that copies pace and structure, not content.
 */
export async function analyzeReference({ db, run, keys, log = console.log }) {
  const { bucket = "creative-video", path } = run.input ?? {};
  if (!path) throw new Error("run.input.path is required");
  const dir = await mkdtemp(join(tmpdir(), "reference-"));
  const startedAt = Date.now();
  try {
    const videoFile = join(dir, "reference");
    await writeFile(videoFile, await db.download(bucket, path));
    const info = await probe(videoFile);
    if (!info.duration)
      throw new Error("Could not read the reference video duration");
    if (info.duration > MAX_SECONDS)
      throw new Error(
        `Reference video is ${Math.round(info.duration)}s; the limit is ${MAX_SECONDS}s`,
      );
    log(
      `[reference] ${run.id}: ${info.duration.toFixed(1)}s ${info.width}x${info.height}`,
    );

    const shots = buildShots(
      await detectCuts(videoFile, Number(process.env.SCENE_THRESHOLD) || 0.3),
      info.duration,
    );

    const framesDir = posix.join(posix.dirname(path), "frames");
    const keyframes = [];
    const keyframePaths = [];
    for (const shot of shots) {
      const out = join(dir, `shot-${shot.index}.jpg`);
      await extractFrame(videoFile, keyframeTime(shot), out);
      const bytes = await readFile(out);
      keyframes.push(bytes);
      const storagePath = posix.join(framesDir, `shot-${shot.index}.jpg`);
      await db.upload(bucket, storagePath, bytes, "image/jpeg");
      keyframePaths.push(storagePath);
    }

    let transcript = { provider: null, language: null, text: "", words: [] };
    if (info.hasAudio) {
      const audioFile = join(dir, "audio.mp3");
      await extractAudio(videoFile, audioFile);
      transcript = await transcribe(await readFile(audioFile), keys);
    }

    const described = await describeShots(keys.openaiKey, shots, keyframes);
    const withText = described.shots.map((shot, index) => ({
      ...shot,
      keyframe_path: keyframePaths[index],
      transcript: shotTranscript(transcript.words, shot),
    }));
    const proposal = await proposeStoryboard(keys.openaiKey, {
      shots: withText,
      brief: await loadBrief(db, run),
    });

    return {
      output: {
        video: {
          duration: info.duration,
          width: info.width,
          height: info.height,
          has_audio: info.hasAudio,
        },
        shots: withText,
        transcript: {
          provider: transcript.provider,
          language: transcript.language,
          text: transcript.text,
        },
        proposal: { concept: proposal.concept, frames: proposal.frames },
        seconds: Math.round((Date.now() - startedAt) / 100) / 10,
      },
      costUsd: +(
        costOfUsage(described.usage) + costOfUsage(proposal.usage)
      ).toFixed(6),
      tokensIn:
        (described.usage?.prompt_tokens ?? 0) +
        (proposal.usage?.prompt_tokens ?? 0),
      tokensOut:
        (described.usage?.completion_tokens ?? 0) +
        (proposal.usage?.completion_tokens ?? 0),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
