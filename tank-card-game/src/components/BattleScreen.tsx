import type React from "react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getCard } from "../game/cards";
import {
  PLAYER_SPAWN_CELLS,
  getAvailableMoveCells,
  getTargetsInRange,
} from "../game/engine";
import type { Position } from "../game/types";
import { useBattleStore } from "../store/battleStore";
import apShellImage from "../assets/ap-shell.png";
import explosionFlashImage from "../assets/effects/explosion-flash.png";
import explosionFireballImage from "../assets/effects/explosion-fireball.png";
import explosionSmokeImage from "../assets/effects/explosion-smoke.png";

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isPlayerSpawn(position: Position): boolean {
  return PLAYER_SPAWN_CELLS.some((cell) => samePosition(cell, position));
}

function positionLabel(position: Position) {
  return `[${position.row},${position.col}]`;
}

type DamageId = string;

type CellCenter = {
  x: number;
  y: number;
};

type ProjectileEffect = {
  id: number;
  from: CellCenter;
  to: CellCenter;
};

type ExplosionEffect = {
  id: number;
  position: CellCenter;
};

function setObjectRef(
  refs: React.MutableRefObject<Map<string, HTMLButtonElement>>,
  id: string
) {
  return (element: HTMLButtonElement | null) => {
    if (element) {
      refs.current.set(id, element);
    } else {
      refs.current.delete(id);
    }
  };
}

function getElementCenterRelativeToBoard(
  boardElement: HTMLDivElement,
  element: HTMLButtonElement
): CellCenter {
  const boardRect = boardElement.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  return {
    x: elementRect.left - boardRect.left + elementRect.width / 2,
    y: elementRect.top - boardRect.top + elementRect.height / 2,
  };
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

  const [damagedIds, setDamagedIds] = useState<Set<DamageId>>(new Set());
  const [attackingId, setAttackingId] = useState<string | null>(null);
  const [attackEffectId, setAttackEffectId] = useState<string | null>(null);
  const [projectileEffect, setProjectileEffect] =
    useState<ProjectileEffect | null>(null);
  const [explosionEffect, setExplosionEffect] =
    useState<ExplosionEffect | null>(null);

  const previousHpRef = useRef<Map<string, number>>(new Map());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const objectRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const projectileIdRef = useRef(0);
  const explosionIdRef = useRef(0);

  useEffect(() => {
    const currentHp = new Map<string, number>();

    for (const unit of battle.units) {
      currentHp.set(unit.instanceId, unit.currentHp);
    }

    currentHp.set("player_hq", battle.headquarters.player.hp);
    currentHp.set("bot_hq", battle.headquarters.bot.hp);

    const damaged = new Set<string>();

    for (const [id, hp] of currentHp.entries()) {
      const previousHp = previousHpRef.current.get(id);

      if (previousHp !== undefined && hp < previousHp) {
        damaged.add(id);
      }
    }

    previousHpRef.current = currentHp;

    if (damaged.size > 0) {
      setDamagedIds(damaged);

      const timeout = window.setTimeout(() => {
        setDamagedIds(new Set());
      }, 450);

      return () => window.clearTimeout(timeout);
    }
  }, [battle]);

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

    const attackerElement = objectRefs.current.get(selectedAttacker.id);
    const targetElement = objectRefs.current.get(targetId);
    const boardElement = boardRef.current;

    let targetCenter: CellCenter | null = null;

    setAttackingId(selectedAttacker.id);

    if (attackerElement && targetElement && boardElement) {
      const from = getElementCenterRelativeToBoard(
        boardElement,
        attackerElement
      );
      const to = getElementCenterRelativeToBoard(boardElement, targetElement);

      targetCenter = to;

      projectileIdRef.current += 1;

      setProjectileEffect({
        id: projectileIdRef.current,
        from,
        to,
      });
    }

    window.setTimeout(() => {
      dispatch({
        type: "ATTACK",
        playerId: "player",
        attackerType: selectedAttacker.type,
        attackerId: selectedAttacker.id,
        targetType,
        targetId,
      });

      setAttackEffectId(targetId);

      if (targetCenter) {
        explosionIdRef.current += 1;

        setExplosionEffect({
          id: explosionIdRef.current,
          position: targetCenter,
        });
      }
    }, 260);

    window.setTimeout(() => {
      setAttackingId(null);
      setProjectileEffect(null);
    }, 420);

    window.setTimeout(() => {
      setAttackEffectId(null);
      setExplosionEffect(null);
    }, 1200);
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

          <motion.div ref={boardRef} layout style={styles.board}>
            <AnimatePresence>
              {projectileEffect && (
                <motion.img
                  key={projectileEffect.id}
                  src={apShellImage}
                  alt=""
                  style={{
                    ...styles.projectileImage,
                    left: projectileEffect.from.x,
                    top: projectileEffect.from.y,
                    rotate: `${Math.atan2(
                      projectileEffect.to.y - projectileEffect.from.y,
                      projectileEffect.to.x - projectileEffect.from.x
                    )}rad`,
                  }}
                  initial={{
                    x: 0,
                    y: 0,
                    opacity: 0,
                    scale: 0.22,
                  }}
                  animate={{
                    x: projectileEffect.to.x - projectileEffect.from.x,
                    y: projectileEffect.to.y - projectileEffect.from.y,
                    opacity: [0, 1, 1, 0],
                    scale: [0.22, 0.28, 0.28, 0.22],
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.34,
                    ease: "easeOut",
                  }}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {explosionEffect && (
                <motion.div
                  key={explosionEffect.id}
                  style={{
                    ...styles.explosionContainer,
                    left: explosionEffect.position.x,
                    top: explosionEffect.position.y,
                  }}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.img
                    src={explosionFlashImage}
                    alt=""
                    style={styles.explosionFlash}
                    initial={{ opacity: 0, scale: 0.15, rotate: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0.15, 1.15, 1.7],
                      rotate: [0, 8, -4],
                    }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  />

                  <motion.img
                    src={explosionFireballImage}
                    alt=""
                    style={styles.explosionFireball}
                    initial={{ opacity: 0, scale: 0.25, rotate: -6 }}
                    animate={{
                      opacity: [0, 1, 0.9, 0],
                      scale: [0.25, 1.05, 1.35, 1.55],
                      rotate: [-6, 4, -2, 0],
                    }}
                    transition={{ duration: 0.52, ease: "easeOut", delay: 0.06 }}
                  />

                  <motion.img
                    src={explosionSmokeImage}
                    alt=""
                    style={styles.explosionSmoke}
                    initial={{ opacity: 0, scale: 0.35, y: 4 }}
                    animate={{
                      opacity: [0, 0.55, 0.35, 0],
                      scale: [0.35, 1.1, 1.45, 1.85],
                      y: [4, -2, -8, -14],
                    }}
                    transition={{ duration: 0.95, ease: "easeOut", delay: 0.12 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

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
                  const isDamaged = damagedIds.has(unit.instanceId);
                  const isAttacking = attackingId === unit.instanceId;

                  return (
                    <motion.button
                      ref={setObjectRef(objectRefs, unit.instanceId)}
                      layout
                      layoutId={unit.instanceId}
                      key={unit.instanceId}
                      style={{
                        ...styles.cell,
                        ...(unit.ownerId === "player"
                          ? styles.playerUnit
                          : styles.botUnit),
                        ...(canBeTarget ? styles.targetCell : {}),
                        ...(isDamaged ? styles.damageCell : {}),
                      }}
                      initial={{ scale: 0.88, opacity: 0 }}
                      animate={{
                        scale: isDamaged ? [1, 1.08, 1] : 1,
                        opacity: 1,
                        x: isAttacking ? [0, 10, -6, 0] : 0,
                      }}
                      exit={{ scale: 0.75, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 26,
                      }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
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

                      <AnimatePresence>
                        {attackEffectId === unit.instanceId && (
                          <motion.span
                            style={styles.explosionEffect}
                            initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                            animate={{
                              opacity: [0, 1, 0.85, 0],
                              scale: [0.2, 1.1, 1.6, 2.2],
                              rotate: [0, 12, -8, 0],
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                          />
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                }

                if (isPlayerHq || isBotHq) {
                  const owner = isPlayerHq ? "player" : "bot";
                  const hq = battle.headquarters[owner];
                  const hqId = `${owner}_hq`;
                  const canBeTarget = isTarget("headquarters", hqId);
                  const isDamaged = damagedIds.has(hqId);
                  const isAttacking = attackingId === hqId;

                  return (
                    <motion.button
                      ref={setObjectRef(objectRefs, hqId)}
                      layout
                      layoutId={hqId}
                      key={hqId}
                      style={{
                        ...styles.cell,
                        ...styles.hqCell,
                        ...(owner === "player"
                          ? styles.playerHq
                          : styles.botHq),
                        ...(canBeTarget ? styles.targetCell : {}),
                        ...(isDamaged ? styles.damageCell : {}),
                      }}
                      animate={{
                        scale: isDamaged ? [1, 1.08, 1] : 1,
                        x: isAttacking ? [0, 10, -6, 0] : 0,
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 26,
                      }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (canBeTarget) {
                          handleAttackTarget("headquarters", hqId);
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

                      <AnimatePresence>
                        {attackEffectId === hqId && (
                          <motion.span
                            style={styles.explosionEffect}
                            initial={{ opacity: 0, scale: 0.2, rotate: 0 }}
                            animate={{
                              opacity: [0, 1, 0.85, 0],
                              scale: [0.2, 1.1, 1.6, 2.2],
                              rotate: [0, 12, -8, 0],
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                          />
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                }

                const moveCell = isMoveCell(position);

                return (
                  <motion.button
                    layout
                    key={`${row}-${col}`}
                    style={{
                      ...styles.cell,
                      ...(spawn ? styles.spawnCell : {}),
                      ...(moveCell ? styles.moveCell : {}),
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 28,
                    }}
                    onClick={() => handleCellClick(position)}
                  >
                    <small>{positionLabel(position)}</small>
                    {spawn && <span>Спавн</span>}
                    {moveCell && <span>Движение</span>}
                  </motion.button>
                );
              })
            )}
          </motion.div>

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
              <AnimatePresence>
                {battle.player.hand.map((cardInstance) => {
                  const card = getCard(cardInstance.cardId);
                  const selected =
                    selectedCardInstanceId === cardInstance.instanceId;

                  return (
                    <motion.button
                      key={cardInstance.instanceId}
                      layout
                      style={{
                        ...styles.card,
                        ...(selected ? styles.selectedCard : {}),
                      }}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -16 }}
                      transition={{
                        type: "spring",
                        stiffness: 280,
                        damping: 24,
                      }}
                      whileHover={{ y: -4, scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
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
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        </section>

        <aside style={styles.logPanel}>
          <h2 style={styles.sectionTitle}>Лог боя</h2>
          <div style={styles.log}>
            {battle.log.map((item, index) => (
              <motion.p
                key={`${item}-${index}`}
                style={styles.logItem}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                {item}
              </motion.p>
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
    position: "relative",
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
    gap: 8,
    marginBottom: 16,
  },
  cell: {
    minHeight: 120,
    position: "relative",
    overflow: "hidden",
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
  damageCell: {
    outline: "4px solid #ffdf6e",
    filter: "brightness(1.25)",
  },
  projectileImage: {
    position: "absolute",
    width: 210,
    height: "auto",
    marginLeft: -105,
    marginTop: -25,
    zIndex: 20,
    pointerEvents: "none",
    transformOrigin: "center center",
    filter: "drop-shadow(0 0 8px rgba(255, 209, 102, 0.75))",
  },
  explosionContainer: {
    position: "absolute",
    width: 140,
    height: 140,
    marginLeft: -70,
    marginTop: -70,
    zIndex: 35,
    pointerEvents: "none",
  },
  explosionFlash: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    mixBlendMode: "screen",
    filter: "drop-shadow(0 0 18px rgba(255, 229, 120, 0.95))",
  },
  explosionFireball: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    mixBlendMode: "screen",
    filter: "drop-shadow(0 0 22px rgba(255, 104, 20, 0.85))",
  },
  explosionSmoke: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    opacity: 0.55,
    filter: "drop-shadow(0 0 12px rgba(30, 30, 30, 0.65))",
  },
  explosionEffect: {
    position: "absolute",
    inset: "50%",
    width: 26,
    height: 26,
    marginLeft: -13,
    marginTop: -13,
    borderRadius: "999px",
    background:
      "radial-gradient(circle, #fff3a3 0%, #ffb703 35%, #fb5607 62%, rgba(251, 86, 7, 0) 72%)",
    boxShadow: "0 0 28px 12px rgba(251, 86, 7, 0.8)",
    zIndex: 10,
    pointerEvents: "none",
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