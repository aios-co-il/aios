import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalError } from "../guard.mjs";

const isJpeg = (b) => b?.[0] === 0xff && b?.[1] === 0xd8 && b?.[2] === 0xff;
const isPng = (b) =>
  b?.[0] === 0x89 && b?.[1] === 0x50 && b?.[2] === 0x4e && b?.[3] === 0x47;

/**
 * A still as an engine fetches it from a link. JPEG and PNG keep their bytes and get their
 * real type. Anything else (a WebP from user materials) becomes a PNG, which every engine takes.
 */
export async function publicStill(bytes, convert = toPng) {
  if (isJpeg(bytes)) return { bytes, ext: "jpg", contentType: "image/jpeg" };
  if (isPng(bytes)) return { bytes, ext: "png", contentType: "image/png" };
  return { bytes: await convert(bytes), ext: "png", contentType: "image/png" };
}

async function toPng(bytes) {
  const dir = await mkdtemp(join(tmpdir(), "still-"));
  try {
    const input = join(dir, "still");
    const output = join(dir, "still.png");
    await writeFile(input, bytes);
    await new Promise((resolve, reject) => {
      const child = spawn(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          input,
          "-frames:v",
          "1",
          output,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg ${code}: ${stderr.slice(-300)}`)),
      );
    });
    return new Uint8Array(await readFile(output));
  } catch (error) {
    throw finalError(
      `clip run: the scene still could not be converted to PNG (${error instanceof Error ? error.message : error})`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
