type RuntimeImportMeta = ImportMeta & {
  env?: {
    VITE_PROFILE_SERVER_URL?: string;
    VITE_PVP_SERVER_URL?: string;
  };
};

export function getDefaultWebSocketUrl(): string {
  if (typeof window === "undefined") {
    return "ws://localhost:8787";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const { hostname, port } = window.location;
  const localDevPorts = new Set(["5173", "4173"]);

  if (localDevPorts.has(port)) {
    return `ws://${hostname}:8787`;
  }

  return `${protocol}//${window.location.host}`;
}

export function getConfiguredProfileWebSocketUrl(): string {
  const env = (import.meta as RuntimeImportMeta).env ?? {};

  return (
    env.VITE_PROFILE_SERVER_URL ??
    env.VITE_PVP_SERVER_URL ??
    getDefaultWebSocketUrl()
  );
}

export function getHttpUrlFromWebSocketUrl(webSocketUrl: string): string {
  return webSocketUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function getConfiguredProfileHttpUrl(): string {
  return getHttpUrlFromWebSocketUrl(getConfiguredProfileWebSocketUrl());
}
