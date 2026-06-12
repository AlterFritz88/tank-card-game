import { useEffect, useState } from "react";
import {
  profileClient,
  type ProfileConnectionSnapshot,
} from "./profileClient";

export function useProfileConnection(): ProfileConnectionSnapshot {
  const [snapshot, setSnapshot] = useState(() =>
    profileClient.getConnectionSnapshot()
  );

  useEffect(() => profileClient.subscribe(setSnapshot), []);

  return snapshot;
}

export function isProfileServerUnavailable(
  snapshot: ProfileConnectionSnapshot
): boolean {
  return snapshot.status === "offline" || snapshot.status === "error";
}

export async function retryProfileConnection(): Promise<void> {
  await profileClient.reconnect();
}
