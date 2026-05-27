import { useState } from "react";
import type { CSSProperties } from "react";
import { useBattleStore } from "../store/battleStore";

export function PvpLobby() {
  const [roomCode, setRoomCode] = useState("");
  const {
    mode,
    pvpRoomId,
    pvpStatus,
    pvpError,
    localPlayerId,
    createPvpRoom,
    joinPvpRoom,
    startAiBattle,
  } = useBattleStore();

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Режим игры</div>

      <div style={styles.row}>
        <button type="button" style={styles.button} onClick={startAiBattle}>
          Играть против бота
        </button>
        <button type="button" style={styles.button} onClick={createPvpRoom}>
          Создать PVP комнату
        </button>
      </div>

      <div style={styles.row}>
        <input
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
          placeholder="Код комнаты"
          style={styles.input}
        />
        <button
          type="button"
          style={styles.button}
          onClick={() => joinPvpRoom(roomCode)}
        >
          Войти
        </button>
      </div>

      <div style={styles.status}>
        Режим: {mode === "ai" ? "бот" : "PVP"}
        {pvpRoomId ? ` · Комната: ${pvpRoomId}` : ""}
        {mode === "pvp" ? ` · Статус: ${pvpStatus}` : ""}
        {mode === "pvp" ? ` · Вы: ${localPlayerId}` : ""}
      </div>

      {pvpStatus === "waiting" && pvpRoomId ? (
        <div style={styles.hint}>Передай код комнаты второму игроку: {pvpRoomId}</div>
      ) : null}

      {pvpError ? <div style={styles.error}>{pvpError}</div> : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: "fixed",
    left: 16,
    top: 16,
    zIndex: 1000,
    width: 320,
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(220, 184, 96, 0.45)",
    background: "rgba(16, 18, 20, 0.88)",
    color: "#f4e5bf",
    fontFamily: "sans-serif",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  title: {
    fontWeight: 700,
    marginBottom: 10,
  },
  row: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  button: {
    cursor: "pointer",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(220, 184, 96, 0.5)",
    background: "rgba(74, 58, 34, 0.95)",
    color: "#f8e3ae",
    fontWeight: 700,
  },
  input: {
    minWidth: 0,
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(220, 184, 96, 0.5)",
    background: "rgba(0, 0, 0, 0.35)",
    color: "#fff2cc",
    textTransform: "uppercase",
  },
  status: {
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.9,
  },
  hint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: 700,
    color: "#ffe08a",
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    color: "#ff8a8a",
  },
};
