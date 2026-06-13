import { Suspense, lazy, useEffect, useState } from "react";

import {
  LoadingScreen,
  preloadCriticalMenuAssets,
} from "./components/LoadingScreen";
import { useBattleStore } from "./store/battleStore";

const BattleScreen = lazy(() =>
  import("./components/BattleScreen").then((module) => ({
    default: module.BattleScreen,
  }))
);
const PvpLobby = lazy(() =>
  import("./components/PvpLobby").then((module) => ({
    default: module.PvpLobby,
  }))
);

export default function App() {
  const battle = useBattleStore((state) => state.battle);
  const restorePvpSession = useBattleStore((state) => state.restorePvpSession);
  const [bootReady, setBootReady] = useState(false);

  useEffect(() => {
    restorePvpSession();
  }, [restorePvpSession]);

  useEffect(() => {
    let cancelled = false;
    const minVisibleTime = new Promise<void>((resolve) =>
      window.setTimeout(resolve, 700)
    );

    void Promise.all([preloadCriticalMenuAssets(), minVisibleTime]).then(() => {
      if (!cancelled) setBootReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootReady) return <LoadingScreen />;

  return (
    <Suspense fallback={<LoadingScreen />}>
      {battle ? <BattleScreen /> : <PvpLobby />}
    </Suspense>
  );
}
