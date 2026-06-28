import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolveWritableDbPath, writeJsonFileAtomic } from "./storagePath";

// Session tokens are stateless: a token is `${payload}.${hmac}` where payload is
// a base64url-encoded JSON `{ uid, exp }`. The server only needs the signing
// secret to verify them, so they survive restarts without a session database.
const TOKEN_TTL_MS = Number(
  process.env.AUTH_TOKEN_TTL_MS ?? 60 * 24 * 60 * 60_000
);

function loadSecret(): string {
  const fromEnv = process.env.AUTH_TOKEN_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;

  // No secret configured: generate one and persist it next to the other JSON
  // databases so sessions stay valid across restarts on the same volume.
  const secretPath = resolveWritableDbPath(
    undefined,
    "auth-token-secret.json",
    "Auth token secret"
  );

  try {
    if (existsSync(secretPath)) {
      const parsed = JSON.parse(readFileSync(secretPath, "utf8")) as {
        secret?: unknown;
      };
      if (typeof parsed.secret === "string" && parsed.secret.length >= 32) {
        return parsed.secret;
      }
    }
  } catch {
    // Fall through and regenerate.
  }

  const secret = randomBytes(48).toString("hex");
  try {
    writeJsonFileAtomic(secretPath, { secret });
    console.warn(
      "AUTH_TOKEN_SECRET is not set; generated and persisted a random secret. " +
        "Set AUTH_TOKEN_SECRET in production so sessions survive redeploys."
    );
  } catch (error) {
    console.warn(
      "Failed to persist generated auth token secret; sessions will reset on restart",
      error
    );
  }

  return secret;
}

const SECRET = loadSecret();

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

/**
 * Returns the userId encoded in a valid, unexpired token, or null when the token
 * is malformed, tampered with, or expired. The signature is compared with a
 * constant-time check to avoid leaking it through timing.
 */
export function verifySessionToken(token: unknown): string | null {
  if (typeof token !== "string") return null;

  const separator = token.indexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { uid?: unknown; exp?: unknown };

    if (typeof decoded.uid !== "string" || !decoded.uid) return null;
    if (typeof decoded.exp !== "number" || decoded.exp < Date.now()) return null;

    return decoded.uid;
  } catch {
    return null;
  }
}
