type VkPlayStatusResponse = {
  status?: unknown;
  loginStatus?: unknown;
  errmsg?: unknown;
};

type VkPlayTokenResponse = {
  status?: unknown;
  uid?: unknown;
  hash?: unknown;
  errmsg?: unknown;
};

type VkPlayProfileResponse = {
  status?: unknown;
  uid?: unknown;
  nick?: unknown;
};

type VkPlayExternalApi = {
  getLoginStatus: () => void;
  getAuthToken: () => void;
  userProfile: () => void;
  registerUser: () => void;
  authUser: () => void;
  reloadWindow: () => void;
};

type VkPlayCallbacks = {
  appid: string | number;
  getLoginStatusCallback: (status: VkPlayStatusResponse) => void;
  getAuthTokenCallback: (token: VkPlayTokenResponse) => void;
  userProfileCallback: (profile: VkPlayProfileResponse) => void;
  registerUserCallback: (info: unknown) => void;
  confirmWindowClosedCallback: () => void;
  userInfoCallback: (info: unknown) => void;
  paymentFrameUrlCallback: (url: unknown) => void;
  paymentReceivedCallback: (data: unknown) => void;
  paymentWindowClosedCallback: () => void;
  userConfirmCallback: () => void;
  paymentFrameItem: (object: unknown) => void;
  getGameInventoryItems: (data?: unknown) => void;
};

declare global {
  interface Window {
    iframeApi?: (
      callbacks: VkPlayCallbacks
    ) => Promise<VkPlayExternalApi>;
  }
}

export type VkPlayAuthorization = {
  uid: string;
  hash: string;
  nickname: string;
};

const API_TIMEOUT_MS = 20_000;
const REGISTRATION_TIMEOUT_MS = 5 * 60_000;
const SCRIPT_MARKER = "data-panzershrek-vk-play-api";

let authorizationPromise: Promise<VkPlayAuthorization> | null = null;

function getConfiguredAppId(): string {
  const env = import.meta.env as ImportMetaEnv & {
    VITE_VK_PLAY_APP_ID?: string;
  };
  return env.VITE_VK_PLAY_APP_ID?.trim() ?? "";
}

function getLaunchAppId(): string {
  const queryAppId = new URLSearchParams(window.location.search)
    .get("appid")
    ?.trim();
  return queryAppId || getConfiguredAppId();
}

function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isVkPlayLaunch(): boolean {
  if (typeof window.iframeApi === "function") return true;
  if (!isEmbedded()) return false;

  const query = new URLSearchParams(window.location.search);
  if (query.has("appid")) return true;

  try {
    const referrer = new URL(document.referrer);
    return (
      (referrer.hostname === "vkplay.ru" || referrer.hostname.endsWith(".vkplay.ru")) &&
      Boolean(getLaunchAppId())
    );
  } catch {
    return false;
  }
}

function formatVkPlayError(value: unknown, fallback: string): Error {
  if (value && typeof value === "object") {
    const message = (value as { errmsg?: unknown }).errmsg;
    if (typeof message === "string" && message.trim()) {
      return new Error(`${fallback}: ${message.trim()}`);
    }
  }
  return new Error(fallback);
}

async function loadVkPlayScript(appId: string): Promise<void> {
  if (typeof window.iframeApi === "function") return;

  const existing = document.querySelector<HTMLScriptElement>(
    `script[${SCRIPT_MARKER}]`
  );
  const script = existing ?? document.createElement("script");

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("VK Play JS API did not load in time"));
    }, API_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      window.clearTimeout(timeoutId);
      callback();
    };

    script.addEventListener("load", () => finish(resolve), { once: true });
    script.addEventListener(
      "error",
      () => finish(() => reject(new Error("Could not load VK Play JS API"))),
      { once: true }
    );

    if (!existing) {
      script.setAttribute(SCRIPT_MARKER, "true");
      script.src = `https://vkplay.ru/app/${encodeURIComponent(appId)}/static/mailru.core.js`;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  if (typeof window.iframeApi !== "function") {
    throw new Error("VK Play JS API is unavailable outside the VK Play frame");
  }
}

function waitForCallback<T>(
  register: (resolve: (value: T) => void, reject: (error: Error) => void) => void,
  invoke: () => void,
  timeoutMs = API_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("VK Play did not respond in time"));
    }, timeoutMs);
    const settleResolve = (value: T) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    const settleReject = (error: Error) => {
      window.clearTimeout(timeoutId);
      reject(error);
    };

    register(settleResolve, settleReject);
    try {
      invoke();
    } catch (error) {
      settleReject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function authorizeWithVkPlay(): Promise<VkPlayAuthorization> {
  if (!isVkPlayLaunch()) {
    throw new Error("The game was not launched from VK Play");
  }

  const appId = getLaunchAppId();
  if (!appId) {
    throw new Error("VK Play app ID is missing");
  }

  await loadVkPlayScript(appId);

  let loginStatusResolve: ((value: VkPlayStatusResponse) => void) | null = null;
  let tokenResolve: ((value: VkPlayTokenResponse) => void) | null = null;
  let profileResolve: ((value: VkPlayProfileResponse) => void) | null = null;
  let registerResolve: ((value: unknown) => void) | null = null;
  let registerReject: ((error: Error) => void) | null = null;
  const noop = () => {};
  const callbacks: VkPlayCallbacks = {
    appid: /^\d+$/.test(appId) ? Number(appId) : appId,
    getLoginStatusCallback: (status) => loginStatusResolve?.(status),
    getAuthTokenCallback: (token) => tokenResolve?.(token),
    userProfileCallback: (profile) => profileResolve?.(profile),
    registerUserCallback: (info) => registerResolve?.(info),
    confirmWindowClosedCallback: () =>
      registerReject?.(new Error("VK Play registration was cancelled")),
    userInfoCallback: noop,
    paymentFrameUrlCallback: noop,
    paymentReceivedCallback: noop,
    paymentWindowClosedCallback: noop,
    userConfirmCallback: noop,
    paymentFrameItem: noop,
    getGameInventoryItems: noop,
  };
  const iframeApi = window.iframeApi;
  if (!iframeApi) throw new Error("VK Play JS API is unavailable");
  const externalApi = await iframeApi(callbacks);

  const status = await waitForCallback<VkPlayStatusResponse>(
    (resolve) => {
      loginStatusResolve = resolve;
    },
    () => externalApi.getLoginStatus()
  );
  if (status.status !== "ok") {
    throw formatVkPlayError(status, "Could not get VK Play login status");
  }

  const loginStatus = Number(status.loginStatus);
  if (loginStatus === 0) {
    externalApi.authUser();
    return new Promise<VkPlayAuthorization>(() => {});
  }

  if (loginStatus === 1) {
    await waitForCallback<unknown>(
      (resolve, reject) => {
        registerResolve = resolve;
        registerReject = reject;
      },
      () => externalApi.registerUser(),
      REGISTRATION_TIMEOUT_MS
    );
    externalApi.reloadWindow();
    return new Promise<VkPlayAuthorization>(() => {});
  }

  if (loginStatus !== 2 && loginStatus !== 3) {
    throw new Error("VK Play returned an unknown login status");
  }

  const profile = await waitForCallback<VkPlayProfileResponse>(
    (resolve) => {
      profileResolve = resolve;
    },
    () => externalApi.userProfile()
  ).catch(() => null);

  // Request the one-time token last so it reaches our server immediately and
  // cannot expire while optional profile data is still loading.
  const token = await waitForCallback<VkPlayTokenResponse>(
    (resolve) => {
      tokenResolve = resolve;
    },
    () => externalApi.getAuthToken()
  );
  if (
    token.status !== "ok" ||
    (typeof token.uid !== "string" && typeof token.uid !== "number") ||
    typeof token.hash !== "string" ||
    !token.hash
  ) {
    throw formatVkPlayError(token, "Could not get VK Play authorization token");
  }

  return {
    uid: String(token.uid),
    hash: token.hash,
    nickname:
      profile?.status === "ok" && typeof profile.nick === "string"
        ? profile.nick
        : "",
  };
}

export function getVkPlayAuthorization(options?: {
  forceRefresh?: boolean;
}): Promise<VkPlayAuthorization> {
  if (options?.forceRefresh) authorizationPromise = null;
  authorizationPromise ??= authorizeWithVkPlay().catch((error) => {
    authorizationPromise = null;
    throw error;
  });
  return authorizationPromise;
}
