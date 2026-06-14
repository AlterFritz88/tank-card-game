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
