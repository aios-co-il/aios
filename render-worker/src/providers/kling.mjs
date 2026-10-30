import { createHmac } from "node:crypto";

// Official Kling API, image-to-video. Endpoint, model name and auth follow the
// published v1 image2video API; check them against the current docs before the
// first paid run on a new account (KLING_BASE_URL / KLING_MODEL override them).
const BASE = () =>
  (process.env.KLING_BASE_URL || "https://api-singapore.klingai.com").replace(
    /\/$/,
    "",
  );
export const klingBaseUrl = BASE;
const MODEL = () => process.env.KLING_MODEL || "kling-v3";
const MODE = () => process.env.KLING_MODE || "pro";
// From the manual Carmen ad: ~5,100 credits ≈ $0.85 for a 5 s pro clip.
const USD_PER_5S = () => Number(process.env.KLING_USD_PER_5S) || 0.85;
const CREDITS_PER_5S = () => Number(process.env.KLING_CREDITS_PER_5S) || 5100;

const base64url = (value) => Buffer.from(value).toString("base64url");

/** HS256 JWT from the access/secret key pair, valid 30 minutes. */
export function klingToken(
  accessKey,
  secretKey,
  now = Math.floor(Date.now() / 1000),
) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }),
  );
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export const klingDuration = (seconds) => (Number(seconds) > 5 ? "10" : "5");

/**
 * The Kling key pair to sign with: the tenant's own pair wins; the env pair is the agency's
 * fallback, used only when the tenant saved no Kling keys at all (never half of each).
 */
export function klingKeys({ accessKey, secretKey } = {}, env = process.env) {
  const tenant = !!(accessKey || secretKey);
  return tenant
    ? { accessKey, secretKey, tenant }
    : {
        accessKey: env.KLING_ACCESS_KEY,
        secretKey: env.KLING_SECRET_KEY,
        tenant,
      };
}

/** Request headers signed with klingKeys; a missing half fails with what to set. */
export function klingAuth(keys) {
  const { accessKey, secretKey, tenant } = klingKeys(keys);
  return () => {
    if (!accessKey || !secretKey)
      throw new Error(
        tenant
          ? "Kling needs both the Access Key and the Secret Key in AI keys settings"
          : "Kling needs an Access Key and a Secret Key (AI keys settings, or KLING_ACCESS_KEY / KLING_SECRET_KEY)",
      );
    return {
      Authorization: `Bearer ${klingToken(accessKey, secretKey)}`,
      "Content-Type": "application/json",
    };
  };
}

export function klingProvider(keys = {}) {
  const auth = klingAuth(keys);
  return {
    name: "kling",
    model: MODEL(),
    estimate({ durationS }) {
      const factor = klingDuration(durationS) === "10" ? 2 : 1;
      return {
        credits: CREDITS_PER_5S() * factor,
        usd: +(USD_PER_5S() * factor).toFixed(2),
      };
    },
    async submit({ imageBytes, imageUrl, prompt, negativePrompt, durationS }) {
      const response = await fetch(`${BASE()}/v1/videos/image2video`, {
        method: "POST",
        headers: auth(),
        body: JSON.stringify({
          model_name: MODEL(),
          mode: MODE(),
          image: imageBytes
            ? Buffer.from(imageBytes).toString("base64")
            : imageUrl,
          prompt,
          negative_prompt:
            negativePrompt || "text, letters, captions, logo, watermark",
          duration: klingDuration(durationS),
          cfg_scale: 0.5,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code)
        throw new Error(
          `kling submit ${response.status}: ${data.message ?? JSON.stringify(data).slice(0, 300)}`,
        );
      const jobId = data.data?.task_id;
      if (!jobId) throw new Error("kling submit returned no task_id");
      return { jobId };
    },
    async poll(jobId) {
      const response = await fetch(
        `${BASE()}/v1/videos/image2video/${encodeURIComponent(jobId)}`,
        { headers: auth() },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code)
        throw new Error(`kling poll ${response.status}: ${data.message ?? ""}`);
      const status = data.data?.task_status;
      if (status === "succeed") {
        const url = data.data?.task_result?.videos?.[0]?.url;
        return url
          ? { status: "succeeded", url }
          : { status: "failed", error: "kling returned no video url" };
      }
      if (status === "failed")
        return {
          status: "failed",
          error: data.data?.task_status_msg || "kling task failed",
        };
      return { status: "pending" };
    },
  };
}
