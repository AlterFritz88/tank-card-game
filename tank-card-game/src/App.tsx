import { useEffect } from "react";

import { BattleScreen } from "./components/BattleScreen";
import { PvpLobby } from "./components/PvpLobby";
import { useBattleStore } from "./store/battleStore";

export default function App() {
  const battle = useBattleStore((state) => state.battle);
  const restorePvpSession = useBattleStore((state) => state.restorePvpSession);

  useEffect(() => {
    restorePvpSession();
  }, [restorePvpSession]);

  return battle ? <BattleScreen /> : <PvpLobby />;
}
