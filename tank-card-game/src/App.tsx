import { BattleScreen } from "./components/BattleScreen";
import { ConnectedFirstTurnRollOverlay } from "./components/FirstTurnRollOverlay";
import { PvpLobby } from "./components/PvpLobby";
import { useBattleStore } from "./store/battleStore";

export default function App() {
  const battle = useBattleStore((state) => state.battle);

  return (
    <>
      {battle ? <BattleScreen /> : <PvpLobby />}
      <ConnectedFirstTurnRollOverlay />
    </>
  );
}
