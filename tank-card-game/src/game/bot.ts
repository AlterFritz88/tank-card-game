import { getCard } from "./cards";
import { applyAction, getAvailableMoveCells, getFreeSpawnCells, getTargetsInRange } from "./engine";import type { BattleState } from "./types";

export function runBotTurn(state: BattleState): BattleState {
  let nextState = state;

  if (nextState.status !== "active") return nextState;
  if (nextState.activePlayer !== "bot") return nextState;

  const bot = nextState.bot;
  const freeSpawnCells = getFreeSpawnCells(nextState, "bot");

  const playableCards = bot.hand
    .map((cardInstance) => ({
      instance: cardInstance,
      card: getCard(cardInstance.cardId),
    }))
    .filter(({ card }) => card.cost <= bot.resources)
    .sort((a, b) => b.card.cost - a.card.cost);

  if (playableCards.length > 0 && freeSpawnCells.length > 0) {
    nextState = applyAction(nextState, {
      type: "PLAY_CARD",
      playerId: "bot",
      cardInstanceId: playableCards[0].instance.instanceId,
      position: freeSpawnCells[0],
    });
  }

  const movableBotUnits = [...nextState.units].filter(
  (unit) => unit.ownerId === "bot" && !unit.alreadyMoved
);

for (const unit of movableBotUnits) {
  const moveCells = getAvailableMoveCells(nextState, "bot", unit.instanceId);

  if (moveCells.length === 0) continue;

  const playerHq = nextState.headquarters.player.position;

  const bestCell = moveCells
    .map((cell) => ({
      cell,
      distanceToPlayerHq: Math.abs(cell.row - playerHq.row) + Math.abs(cell.col - playerHq.col),
    }))
    .sort((a, b) => a.distanceToPlayerHq - b.distanceToPlayerHq)[0];

  if (bestCell) {
    nextState = applyAction(nextState, {
      type: "MOVE_UNIT",
      playerId: "bot",
      unitId: unit.instanceId,
      position: bestCell.cell,
    });
  }
}

  const botUnits = [...nextState.units].filter((unit) => unit.ownerId === "bot");

  for (const unit of botUnits) {
    const targets = getTargetsInRange(nextState, "bot", "unit", unit.instanceId);

    if (targets.length > 0) {
      const target = targets[0];

      nextState = applyAction(nextState, {
        type: "ATTACK",
        playerId: "bot",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: target.type,
        targetId: target.id,
      });
    }
  }

  const hqTargets = getTargetsInRange(nextState, "bot", "headquarters", "bot_hq");

  if (hqTargets.length > 0) {
    const target = hqTargets[0];

    nextState = applyAction(nextState, {
      type: "ATTACK",
      playerId: "bot",
      attackerType: "headquarters",
      attackerId: "bot_hq",
      targetType: target.type,
      targetId: target.id,
    });
  }

  nextState = applyAction(nextState, {
    type: "END_TURN",
    playerId: "bot",
  });

  return nextState;
}
