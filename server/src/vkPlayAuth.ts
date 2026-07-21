import { createHash } from "node:crypto";

type VkPlayGasResponse = {
  status?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
};

const DEFAULT_AUTH_TIMEOUT_MS = 10_000;

function getRequiredConfig(name: "VK_PLAY_APP_ID" | "VK_PLAY_API_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`VK Play authorization is not configured: ${name} is missing`);
  }
  return value;
}

function normalizeClientIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("::ffff:")) return trimmed.slice("::ffff:".length);
  return trimmed;
}

function createGasSignature(input: {
  appid: string;
  hash: string;
  ip: string;
  uid: string;
  secret: string;
}): string {
  const parameters = {
    appid: input.appid,
    hash: input.hash,
    ip: input.ip,
    uid: input.uid,
  };
  const serialized = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  return createHash("md5")
    .update(serialized + input.secret, "utf8")
    .digest("hex");
}

export async function verifyVkPlayAuthToken(input: {
  uid: string;
  hash: string;
  ip: string;
}): Promise<void> {
  const uid = input.uid.trim();
  const hash = input.hash.trim();
  const ip = normalizeClientIp(input.ip);

  if (!/^\d{1,24}$/.test(uid)) {
    throw new Error("VK Play returned an invalid user identifier");
  }
  if (!hash || hash.length > 1_024) {
    throw new Error("VK Play returned an invalid authorization token");
  }
  if (!ip || ip === "unknown") {
    throw new Error("Could not determine the player IP for VK Play authorization");
  }

  const appid = getRequiredConfig("VK_PLAY_APP_ID");
  const secret = getRequiredConfig("VK_PLAY_API_SECRET");
  const sign = createGasSignature({ appid, hash, ip, uid, secret });
  const requestUrl = new URL(`https://vkplay.ru/app/${encodeURIComponent(appid)}/gas`);
  requestUrl.searchParams.set("uid", uid);
  requestUrl.searchParams.set("hash", hash);
  requestUrl.searchParams.set("ip", ip);
  requestUrl.searchParams.set("sign", sign);

  const configuredTimeout = Number(process.env.VK_PLAY_AUTH_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : DEFAULT_AUTH_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`VK Play authorization service returned HTTP ${response.status}`);
    }

    const result = (await response.json()) as VkPlayGasResponse;
    if (result.status !== "ok") {
      const details = typeof result.errmsg === "string"
        ? result.errmsg
        : `error ${String(result.errcode ?? "unknown")}`;
      throw new Error(`VK Play rejected the authorization token: ${details}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("VK Play authorization service did not respond in time");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
