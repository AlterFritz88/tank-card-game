import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { profileClient } from "./network/profileClient";

const RADIO_PUSH_ENABLED_KEY = "panzershrek.radioPushEnabled";

type PushPermissionState =
  | "prompt"
  | "prompt-with-rationale"
  | "granted"
  | "denied";

type RuStorePushPlugin = {
  checkPermissions(): Promise<{ receive: PushPermissionState }>;
  requestPermissions(): Promise<{ receive: PushPermissionState }>;
  getToken(): Promise<{ token: string }>;
  addListener(
    eventName: "tokenChanged",
    listener: (event: { token: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "notificationActionPerformed",
    listener: (event: { duelId?: string }) => void
  ): Promise<PluginListenerHandle>;
};

const RuStorePush = registerPlugin<RuStorePushPlugin>("RuStorePush");
let listenersPromise: Promise<PluginListenerHandle[]> | null = null;

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function rememberPushEnabled() {
  try {
    window.localStorage.setItem(RADIO_PUSH_ENABLED_KEY, "true");
  } catch {
    // A denied storage write must not prevent native registration.
  }
}

function wasPushEnabled(): boolean {
  try {
    return window.localStorage.getItem(RADIO_PUSH_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

function submitToken(token: string) {
  void profileClient.registerRuStorePushToken(token).catch(() => {
    // The profile socket retries in the background and re-sends the token
    // after its next authenticated connection.
  });
}

async function ensureListeners(): Promise<void> {
  if (!listenersPromise) {
    listenersPromise = Promise.all([
      RuStorePush.addListener("tokenChanged", ({ token }) => {
        submitToken(token);
      }),
      RuStorePush.addListener(
        "notificationActionPerformed",
        ({ duelId }) => {
          window.dispatchEvent(
            new CustomEvent("panzershrekOpenRadioDuels", {
              detail: { duelId: duelId ?? null },
            })
          );
        }
      ),
    ]);
  }

  await listenersPromise;
}

async function registerNativePush(requestPermission: boolean): Promise<void> {
  if (!isNativeAndroid()) return;

  await ensureListeners();
  let permission = await RuStorePush.checkPermissions();
  if (
    requestPermission &&
    (permission.receive === "prompt" ||
      permission.receive === "prompt-with-rationale")
  ) {
    permission = await RuStorePush.requestPermissions();
  }

  if (permission.receive !== "granted") return;
  const { token } = await RuStorePush.getToken();
  if (token.trim()) submitToken(token);
}

/** Called when a registered player enters Radio Duels for the first time. */
export async function enableRadioDuelPushNotifications(): Promise<void> {
  if (!isNativeAndroid()) return;
  rememberPushEnabled();
  await registerNativePush(true);
}

/** Refreshes a possibly rotated RuStore token on later application launches. */
export async function restoreRadioDuelPushNotifications(): Promise<void> {
  if (!isNativeAndroid() || !wasPushEnabled()) return;
  await registerNativePush(false);
}
