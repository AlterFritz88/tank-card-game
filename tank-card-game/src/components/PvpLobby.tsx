import type { CSSProperties } from "react";
import { HEADQUARTERS } from "../game/headquarters";
import type { HeadquartersId } from "../game/types";
import { useBattleStore } from "../store/battleStore";
import { HeadquartersCardView } from "./HeadquartersCardView";

function getPvpStatusText(status: string) {
  switch (status) {
    case "connecting":
      return "Подключаемся к серверу...";
    case "searching":
      return "Ищем соперника...";
    case "waiting":
      return "Ожидаем второго игрока...";
    case "matched":
      return "Соперник найден";
    case "rolling":
      return "Жеребьёвка первого хода...";
    case "inBattle":
      return "Бой идет";
    case "finished":
      return "Бой завершен";
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
    selectedHeadquartersId,
    setSelectedHeadquartersId,
    findPvpMatch,
    startAiBattle,
    cancelMatchmaking,
  } = useBattleStore();

  const pvpBusy =
    mode === "pvp" &&
    (pvpStatus === "connecting" ||
      pvpStatus === "searching" ||
      pvpStatus === "waiting" ||
      pvpStatus === "matched" ||
      pvpStatus === "rolling");

  const buttonsDisabled = pvpBusy;

  return (
    <div style={styles.panel}>
      <div style={styles.title}>PanzerShrek</div>
      <div style={styles.subtitle}>
        Выбери штаб. Колода пока назначается автоматически по выбранному штабу.
      </div>

      <div style={styles.sectionTitle}>Штаб</div>
      <div style={styles.headquartersGrid}>
        {Object.values(HEADQUARTERS).map((headquarters) => {
          const selected = headquarters.id === selectedHeadquartersId;

          return (
            <button
              key={headquarters.id}
              type="button"
              style={{
                ...styles.headquartersOption,
                ...(selected ? styles.headquartersOptionSelected : {}),
              }}
              disabled={buttonsDisabled}
              onClick={() =>
                setSelectedHeadquartersId(headquarters.id as HeadquartersId)
              }
            >
              <div style={styles.headquartersCardPreview}>
                <HeadquartersCardView
                  ownerId="player"
                  headquartersId={headquarters.id}
                  hp={headquarters.hp}
                  attack={headquarters.attack}
                  fuelGeneration={headquarters.fuelGeneration}
                  actionFuelCost={headquarters.actionFuelCost}
                  selected={selected}
                />
              </div>

              <div style={styles.headquartersText}>
                <strong style={styles.headquartersName}>{headquarters.title}</strong>
                <span style={styles.headquartersDescription}>
                  {headquarters.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div style={styles.row}>
        <button
          type="button"
          style={styles.button}
          onClick={startAiBattle}
          disabled={buttonsDisabled}
        >
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
        <div style={styles.hint}>
          Ты в очереди. Как только второй игрок нажмёт “Играть PVP”, бой
          начнётся автоматически.
        </div>
      ) : null}

      {pvpBusy ? (
        <div style={styles.row}>
          <button
            type="button"
            style={styles.cancelButton}
            onClick={cancelMatchmaking}
          >
            Отмена
          </button>
        </div>
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
    width: 520,
    maxWidth: "calc(100vw - 32px)",
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(220, 184, 96, 0.45)",
    background: "rgba(16, 18, 20, 0.9)",
    color: "#f4e5bf",
    fontFamily: "sans-serif",
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  },
  title: {
    fontWeight: 900,
    marginBottom: 4,
    fontSize: 22,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 1.35,
    opacity: 0.82,
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#ffe08a",
  },
  headquartersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  headquartersOption: {
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "88px 1fr",
    gap: 10,
    alignItems: "center",
    minHeight: 126,
    padding: 8,
    borderRadius: 12,
    border: "1px solid rgba(220, 184, 96, 0.24)",
    background: "rgba(20, 24, 24, 0.82)",
    color: "#f8e3ae",
    textAlign: "left",
  },
  headquartersOptionSelected: {
    borderColor: "rgba(247, 215, 116, 0.95)",
    boxShadow:
      "0 0 0 2px rgba(247, 215, 116, 0.22), inset 0 0 24px rgba(247, 215, 116, 0.08)",
  },
  headquartersCardPreview: {
    width: 78,
    height: 104,
  },
  headquartersText: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
  },
  headquartersName: {
    fontSize: 15,
    lineHeight: 1.1,
  },
  headquartersDescription: {
    fontSize: 12,
    lineHeight: 1.3,
    color: "rgba(244, 229, 191, 0.78)",
  },
  row: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
  },
  button: {
    cursor: "pointer",
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: "1px solid rgba(220, 184, 96, 0.5)",
    background: "rgba(74, 58, 34, 0.95)",
    color: "#f8e3ae",
    fontWeight: 800,
  },
  primaryButton: {
    background: "rgba(86, 92, 43, 0.96)",
    color: "#fff0b8",
  },
  cancelButton: {
    cursor: "pointer",
    width: "100%",
    padding: "9px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255, 138, 138, 0.55)",
    background: "rgba(76, 31, 31, 0.95)",
    color: "#ffd6d6",
    fontWeight: 800,
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
