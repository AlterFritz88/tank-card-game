import type React from "react";
import { getCard } from "../game/cards";
import {
  PLAYER_SPAWN_CELLS,
  getAvailableMoveCells,
  getTargetsInRange,
} from "../game/engine";
import type { Position } from "../game/types";
import { useBattleStore } from "../store/battleStore";

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isPlayerSpawn(position: Position): boolean {
  return PLAYER_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

function positionLabel(position: Position) {
  return `[${position.row},${position.col}]`;
}

export function BattleScreen() {
  const {
    battle,
    selectedCardInstanceId,
    selectedMode,
    selectedAttacker,
    selectCard,
    selectMode,
    selectAttacker,
    dispatch,
    reset,
  } = useBattleStore();

  const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;

  const selectedTargets =
    selectedAttacker && selectedMode === "attack"
      ? getTargetsInRange(
          battle,
          "player",
          selectedAttacker.type,
          selectedAttacker.id
        )
      : [];

  const selectedMoveCells =
    selectedAttacker &&
    selectedAttacker.type === "unit" &&
    selectedMode === "move"
      ? getAvailableMoveCells(battle, "player", selectedAttacker.id)
      : [];

  function isTarget(targetType: "unit" | "headquarters", targetId: string) {
    return selectedTargets.some(
      (target) => target.type === targetType && target.id === targetId
    );
  }

  function isMoveCell(position: Position) {
    return selectedMoveCells.some((cell) => samePosition(cell, position));
  }

  function handleCellClick(position: Position) {
    if (
      selectedAttacker &&
      selectedAttacker.type === "unit" &&
      selectedMode === "move"
    ) {
      if (!isMoveCell(position)) return;

      dispatch({
        type: "MOVE_UNIT",
        playerId: "player",
        unitId: selectedAttacker.id,
        position,
      });

      return;
    }

    if (!selectedCardInstanceId) return;

    dispatch({
      type: "PLAY_CARD",
      playerId: "player",
      cardInstanceId: selectedCardInstanceId,
      position,
    });
  }

  function handleAttackTarget(
    targetType: "unit" | "headquarters",
    targetId: string
  ) {
    if (!selectedAttacker) return;

    dispatch({
      type: "ATTACK",
      playerId: "player",
      attackerType: selectedAttacker.type,
      attackerId: selectedAttacker.id,
      targetType,
      targetId,
    });
  }

  const statusText =
    battle.status === "active"
      ? `Ход: ${battle.activePlayer === "player" ? "игрок" : "бот"}`
      : battle.status === "player_won"
        ? "Победа!"
        : "Поражение!";

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Tank Cards MVP</h1>
          <p style={styles.subtitle}>Тактический бой 3×5</p>
        </div>

        <div style={styles.headerActions}>
          <strong>{statusText}</strong>
          <button style={styles.button} onClick={reset}>
            Новый бой
          </button>
        </div>
      </header>

      <main style={styles.layout}>
        <section style={styles.leftPanel}>
          <div style={styles.infoRow}>
            <div style={styles.infoCard}>
              <strong>Штаб игрока</strong>
              <span>HP: {battle.headquarters.player.hp}</span>
              <span>Урон: {battle.headquarters.player.attack}</span>
            </div>

            <div style={styles.infoCard}>
              <strong>Штаб противника</strong>
              <span>HP: {battle.headquarters.bot.hp}</span>
              <span>Урон: {battle.headquarters.bot.attack}</span>
            </div>

            <div style={styles.infoCard}>
              <strong>Ресурсы</strong>
              <span>
                {battle.player.resources}/{battle.player.maxResources}
              </span>
            </div>
          </div>

          <div style={styles.board}>
            {rows.map((row) =>
              cols.map((col) => {
                const position: Position = { row, col };

                const unit = battle.units.find((item) =>
                  samePosition(item.position, position)
                );

                const isPlayerHq = samePosition(
                  battle.headquarters.player.position,
                  position
                );

                const isBotHq = samePosition(
                  battle.headquarters.bot.position,
                  position
                );

                const spawn = isPlayerSpawn(position);

                if (unit) {
                  const card = getCard(unit.cardId);
                  const canBeTarget = isTarget("unit", unit.instanceId);

                  return (
                    <button
                      key={`${row}-${col}`}
                      style={{
                        ...styles.cell,
                        ...(unit.ownerId === "player"
                          ? styles.playerUnit
                          : styles.botUnit),
                        ...(canBeTarget ? styles.targetCell : {}),
                      }}
                      onClick={() => {
                        if (canBeTarget) {
                          handleAttackTarget("unit", unit.instanceId);
                          return;
                        }

                        if (unit.ownerId === "player") {
                          selectAttacker({
                            type: "unit",
                            id: unit.instanceId,
                          });
                        }
                      }}
                    >
                      <strong>{card.name}</strong>
                      <small>{positionLabel(position)}</small>
                      <span>
                        HP {unit.currentHp}/{card.hp}
                      </span>
                      <span>
                        ATK {card.attack} RNG {card.range}
                      </span>
                      <span>MOVE {card.movement}</span>
                      {unit.alreadyAttacked && <small>Атаковал</small>}
                      {unit.alreadyMoved && <small>Двигался</small>}
                    </button>
                  );
                }

                if (isPlayerHq || isBotHq) {
                  const owner = isPlayerHq ? "player" : "bot";
                  const hq = battle.headquarters[owner];
                  const canBeTarget = isTarget("headquarters", `${owner}_hq`);

                  return (
                    <button
                      key={`${row}-${col}`}
                      style={{
                        ...styles.cell,
                        ...styles.hqCell,
                        ...(owner === "player"
                          ? styles.playerHq
                          : styles.botHq),
                        ...(canBeTarget ? styles.targetCell : {}),
                      }}
                      onClick={() => {
                        if (canBeTarget) {
                          handleAttackTarget("headquarters", `${owner}_hq`);
                          return;
                        }

                        if (owner === "player") {
                          selectAttacker({
                            type: "headquarters",
                            id: "player_hq",
                          });
                        }
                      }}
                    >
                      <strong>
                        {owner === "player" ? "Штаб игрока" : "Штаб врага"}
                      </strong>
                      <small>{positionLabel(position)}</small>
                      <span>HP {hq.hp}</span>
                      <span>ATK {hq.attack}</span>
                      <span>RNG {hq.range}</span>
                      {hq.alreadyAttacked && <small>Атаковал</small>}
                    </button>
                  );
                }

                const moveCell = isMoveCell(position);

                return (
                  <button
                    key={`${row}-${col}`}
                    style={{
                      ...styles.cell,
                      ...(spawn ? styles.spawnCell : {}),
                      ...(moveCell ? styles.moveCell : {}),
                    }}
                    onClick={() => handleCellClick(position)}
                  >
                    <small>{positionLabel(position)}</small>
                    {spawn && <span>Спавн</span>}
                    {moveCell && <span>Движение</span>}
                  </button>
                );
              })
            )}
          </div>

          <div style={styles.actions}>
            <button
              style={{
                ...styles.button,
                ...(selectedMode === "attack" ? styles.activeModeButton : {}),
              }}
              onClick={() => selectMode("attack")}
            >
              Атака
            </button>

            <button
              style={{
                ...styles.button,
                ...(selectedMode === "move" ? styles.activeModeButton : {}),
              }}
              onClick={() => selectMode("move")}
            >
              Движение
            </button>

            <button
              style={styles.button}
              disabled={
                battle.activePlayer !== "player" || battle.status !== "active"
              }
              onClick={() =>
                dispatch({
                  type: "END_TURN",
                  playerId: "player",
                })
              }
            >
              Закончить ход
            </button>

            {selectedCardInstanceId && (
              <span>
                Выбрана карта для размещения. Нажми на свободный спавн.
              </span>
            )}

            {selectedAttacker && selectedMode === "attack" && (
              <span>Выбран атакующий. Доступные цели подсвечены.</span>
            )}

            {selectedAttacker && selectedMode === "move" && (
              <span>Выбран юнит. Доступные клетки движения подсвечены.</span>
            )}
          </div>

          <section>
            <h2 style={styles.sectionTitle}>Рука</h2>

            <div style={styles.hand}>
              {battle.player.hand.map((cardInstance) => {
                const card = getCard(cardInstance.cardId);
                const selected =
                  selectedCardInstanceId === cardInstance.instanceId;

                return (
                  <button
                    key={cardInstance.instanceId}
                    style={{
                      ...styles.card,
                      ...(selected ? styles.selectedCard : {}),
                    }}
                    onClick={() =>
                      selectCard(selected ? null : cardInstance.instanceId)
                    }
                  >
                    <strong>{card.name}</strong>
                    <small>
                      {card.nation} / {card.class}
                    </small>
                    <span>Cost {card.cost}</span>
                    <span>
                      ATK {card.attack} ARM {card.armor}
                    </span>
                    <span>
                      HP {card.hp} RNG {card.range}
                    </span>
                    <span>MOVE {card.movement}</span>
                    <small>{card.abilityText}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </section>

        <aside style={styles.logPanel}>
          <h2 style={styles.sectionTitle}>Лог боя</h2>
          <div style={styles.log}>
            {battle.log.map((item, index) => (
              <p key={`${item}-${index}`} style={styles.logItem}>
                {item}
              </p>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#101418",
    color: "#eef2f3",
    padding: 24,
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    margin: 0,
    fontSize: 32,
  },
  subtitle: {
    margin: "6px 0 0",
    opacity: 0.7,
  },
  headerActions: {
    display: "flex",
    gap: 16,
    alignItems: "center",
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "1fr 320px",
    gap: 24,
  },
  leftPanel: {
    minWidth: 0,
  },
  infoRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 12,
    borderRadius: 12,
    background: "#1b232b",
    border: "1px solid #2c3844",
  },
  board: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
    gap: 8,
    marginBottom: 16,
  },
  cell: {
    minHeight: 120,
    borderRadius: 12,
    border: "1px solid #2c3844",
    background: "#151b21",
    color: "#eef2f3",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    alignItems: "flex-start",
    justifyContent: "center",
    cursor: "pointer",
    textAlign: "left",
  },
  spawnCell: {
    border: "1px dashed #8aa36f",
    background: "#1c261d",
  },
  moveCell: {
    outline: "3px solid #7de38d",
    background: "#1d3021",
  },
  playerUnit: {
    background: "#162331",
    border: "1px solid #4e83b7",
  },
  botUnit: {
    background: "#311b1b",
    border: "1px solid #b75b4e",
  },
  hqCell: {
    fontWeight: 700,
  },
  playerHq: {
    background: "#24324b",
    border: "2px solid #7aa2ff",
  },
  botHq: {
    background: "#4b2424",
    border: "2px solid #ff8b7a",
  },
  targetCell: {
    outline: "3px solid #f7d774",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  button: {
    border: "none",
    borderRadius: 10,
    background: "#d6a84f",
    color: "#121212",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  activeModeButton: {
    outline: "3px solid #ffffff",
  },
  sectionTitle: {
    margin: "0 0 12px",
    fontSize: 20,
  },
  hand: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 10,
  },
  card: {
    minHeight: 170,
    borderRadius: 12,
    border: "1px solid #3a4652",
    background: "#1b232b",
    color: "#eef2f3",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    alignItems: "flex-start",
    cursor: "pointer",
    textAlign: "left",
  },
  selectedCard: {
    outline: "3px solid #d6a84f",
  },
  logPanel: {
    background: "#1b232b",
    border: "1px solid #2c3844",
    borderRadius: 12,
    padding: 16,
    alignSelf: "start",
  },
  log: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  logItem: {
    margin: 0,
    fontSize: 14,
    opacity: 0.9,
  },
};