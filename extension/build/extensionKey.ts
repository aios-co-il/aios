import { createHash } from "node:crypto";
import type { EnvironmentName } from "./environment";

/**
 * The public half of each build's key (base64 DER), written into the manifest as "key".
 * It fixes the id of an unpacked build on every machine, which the site's framing rule in
 * vercel.json names. Each environment has its own, so both builds load in one Chrome.
 *
 * A Chrome Web Store item has its own key and id. When a build is published there, put the
 * public key the Developer Dashboard shows for the item (Package, "View public key") here
 * and the id it gives in vercel.json: Chrome documents that as the way to keep one id for
 * the unpacked and the store build. `pnpm test:guards` fails until the two files agree.
 *
 * The private halves are never in the repository; no build reads them.
 */
export const EXTENSION_PUBLIC_KEYS: Record<EnvironmentName, string> = {
  production:
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyz4RGMkxodPxzkSnK0eS/R0g2IJxNIWiDUVvcZeWzOkmjDPpc5u9fjX1M2eHS1d4/lu/p+v1gLcXiXDRNrv8sNvMiNVFMtVvaSFvpdK8E+9YELWJHrfdK+8FSgk1fakkmYuj+oZ1RCvZT7Mifn5JsbAe0FBm9VksW32/t9GhIE2iI85oV5bKp9SGYi6y+l46FYcoLUQeDpsS26sCjyzw04lwcEexO9z/9+lIfPOHfN5A+bKo2ze3wY//k862+vUUqWaHdt3Iu6/wya1kT6MWI7C3L+lcNJKKhSUPuHsPH9TU1h3YhclndWiyZ+a9dTGNwXag7FrMyzRXa7gSEJf9CQIDAQAB",
  staging:
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA26oCkTpqoIWwtLYZkkUHHUCik8z2uEZ3P5d+PX36BJJHL586BkxYZx/JO4dJFHCjULOp/kew/fDSB9GKvmwtj3iidjFmN0p+LCcX4KT80E4tTS6linCyQvWjcpZEqV2yr7mcZA0dby2UCWM3UFwcmPqIjKCYTqVubRZqnLPy6DQEjBLlGNMsNtSNE12KaYTbcUc2LSaZojQpaaZ3Ko7hrY2IU3aL5C6jgbQyP9p31jKWkvr4RoJYtBxFxw5YGOjQBYkk95wfhIMqm9TFrnN/fyFp4lbls7mN4OH0y2NVh2YjiRBFzwABhlCnKp+p5qfqJnkikYin431h9spaW3Qm6wIDAQAB",
};

/** The origin of every build's pages, in a fixed order: what the site lets frame it. */
export function extensionOrigins(): Array<string> {
  return Object.values(EXTENSION_PUBLIC_KEYS).map(
    (publicKey) => `chrome-extension://${extensionId(publicKey)}`,
  );
}

/**
 * The id Chrome gives an extension with this key: the first 16 bytes of the key's SHA-256,
 * each hex digit written as a letter from a to p.
 */
export function extensionId(publicKey: string): string {
  const digest = createHash("sha256")
    .update(Buffer.from(publicKey, "base64"))
    .digest("hex");

  return [...digest.slice(0, 32)]
    .map((hexDigit) => String.fromCharCode(97 + parseInt(hexDigit, 16)))
    .join("");
}
