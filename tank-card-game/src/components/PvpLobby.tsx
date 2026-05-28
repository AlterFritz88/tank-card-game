import type { CSSProperties } from "react";
import { useBattleStore } from "../store/battleStore";

function getPvpStatusText(status: string) {
  switch (status) {
    case "connecting":
      return "Подключаемся к серверу...";
    case "matchmaking":
      return "Ищем соперника...";
    case "waiting":
      return "Ожидаем второго игрока...";
    case "rolling":
      return "Жеребьёвка первого хода...";
    case "connected":
      return "Соперник найден";
    case "error":
      return "Ошибка подключения";
    default:
      return "Готово к поиску боя";
  }
}

export function PvpLobby() {
  const {
    mode,
    pvpRoomId,
    pvpStatus,
    pvpError,
    findPvpMatch,
    startAiBattle,
  } = useBattleStore();

  const pvpBusy =
    mode === "pvp" &&
    (pvpStatus === "connecting" ||
      pvpStatus === "matchmaking" ||
      pvpStatus === "waiting" ||
      pvpStatus === "rolling");

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Режим игры</div>
      <div style={styles.subtitle}>Выбери бой. Для PVP код комнаты больше не нужен.</div>

      <div style={styles.row}>
        <button type="button" style={styles.button} onClick={startAiBattle}>
          Играть против бота
        </button>
      </div>

      <div style={styles.row}>
        <button
          type="button"
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={findPvpMatch}
          disabled={pvpBusy}
        >
          {pvpBusy ? "Поиск соперника..." : "Играть PVP"}
        </button>
      </div>

      <div style={styles.status}>
        Режим: {mode === "ai" ? "бот" : "PVP"}
        {mode === "pvp" ? ` · ${getPvpStatusText(pvpStatus)}` : ""}
      </div>

      {mode === "pvp" && pvpRoomId && pvpStatus === "waiting" ? (
        <div style={styles.hint}>Ты в очереди. Как только второй игрок нажмёт “Играть PVP”, бой начнётся автоматически.</div>
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
    width: 340,
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 1.35,
    opacity: 0.8,
    marginBottom: 10,
  },
  row: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  button: {
    cursor: "pointer",
    width: "100%",
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid rgba(220, 184, 96, 0.5)",
    background: "rgba(74, 58, 34, 0.95)",
    color: "#f8e3ae",
    fontWeight: 700,
  },
  primaryButton: {
    background: "rgba(86, 92, 43, 0.96)",
    color: "#fff0b8",
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
