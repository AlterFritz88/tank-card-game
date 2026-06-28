/* Smoke test for national ability tweaks. Run: npx tsx national-abilities-smoke.ts */
import { createInitialBattleState } from "./src/game/initialState";
import {
  applyAction,
  getCohesionUnitIds,
  getNationalDefenseBonus,
  getSupplyLineUnitIds,
} from "./src/game/engine";
import { getNextBotAction } from "./src/game/bot";
import { getCard } from "./src/game/cards";
import type { BattleState, BoardUnit, HeadquartersId } from "./src/game/types";

let failures = 0;

function check(name: string, condition: boolean, details = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${details}`);
  }
}

function makeBattle(opts: {
  playerHq?: HeadquartersId;
  botHq?: HeadquartersId;
}): BattleState {
  const state = createInitialBattleState({
    playerHeadquartersId: opts.playerHq,
    botHeadquartersId: opts.botHq,
    playerDeckCardIds: Array.from({ length: 40 }, () => "t34_76"),
    botDeckCardIds: Array.from({ length: 40 }, () => "t34_76"),
  });
  return applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });
}

function makeUnit(
  partial: Partial<BoardUnit> & {
    instanceId: string;
    cardId: string;
    ownerId: "player" | "bot";
  }
): BoardUnit {
  const card = getCard(partial.cardId);
  return {
    position: { row: 1, col: 1 },
    zone: "battlefield",
    currentHp: card.hp,
    alreadyMoved: false,
    alreadyAttacked: false,
    spawnedThisTurn: false,
    moveCountThisTurn: 0,
    tdAmbushUsedThisTurn: false,
    ...partial,
  };
}

// 1. СССР «Сплочение»: full vertical column (col 0, rows 0–2) → +1 defence each.
{
  const battle = makeBattle({ playerHq: "soviet_tank_brigade" });
  battle.units = [
    makeUnit({ instanceId: "a", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 0 } }),
    makeUnit({ instanceId: "b", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 0 } }),
    makeUnit({ instanceId: "c", cardId: "t34_76", ownerId: "player", position: { row: 2, col: 0 } }),
  ];
  const ids = getCohesionUnitIds(battle, "player");
  check("Сплочение: колонка из 3 активна", ids.size === 3, `size ${ids.size}`);
  const bonus = getNationalDefenseBonus(battle, battle.units[0]);
  check("Сплочение: защита +1 (а не +2)", bonus === 1, `bonus ${bonus}`);
}

// 2. СССР «Сплочение»: only two in a column → no bonus.
{
  const battle = makeBattle({ playerHq: "soviet_tank_brigade" });
  battle.units = [
    makeUnit({ instanceId: "a", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 0 } }),
    makeUnit({ instanceId: "b", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 0 } }),
  ];
  const ids = getCohesionUnitIds(battle, "player");
  check("Сплочение: неполная колонка не даёт бонус", ids.size === 0, `size ${ids.size}`);
}

// 3. США «Линия снабжения»: row of 3 ABUTTING the front column (cols 0–2 for the
//    player) + a rear support unit → triggers.
{
  const battle = makeBattle({ playerHq: "training_camp" });
  battle.units = [
    makeUnit({ instanceId: "a", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 0 } }),
    makeUnit({ instanceId: "b", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 1 } }),
    makeUnit({ instanceId: "c", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 2 } }),
    makeUnit({ instanceId: "s", cardId: "t34_76", ownerId: "player", zone: "support", supportSlot: 0 }),
  ];
  const ids = getSupplyLineUnitIds(battle, "player");
  check("Линия снабжения: линия у тыла активна", ids.size === 3, `size ${ids.size}`);
}

// 4. США «Линия снабжения»: row of 3 NOT touching the front column (cols 1–3) →
//    no supply reaches it, ability does not trigger.
{
  const battle = makeBattle({ playerHq: "training_camp" });
  battle.units = [
    makeUnit({ instanceId: "a", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 1 } }),
    makeUnit({ instanceId: "b", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 2 } }),
    makeUnit({ instanceId: "c", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 3 } }),
    makeUnit({ instanceId: "s", cardId: "t34_76", ownerId: "player", zone: "support", supportSlot: 0 }),
  ];
  const ids = getSupplyLineUnitIds(battle, "player");
  check("Линия снабжения: линия в отрыве от тыла не срабатывает", ids.size === 0, `size ${ids.size}`);
}

// 5. США «Линия снабжения»: line at the front but no rear support → no trigger.
{
  const battle = makeBattle({ playerHq: "training_camp" });
  battle.units = [
    makeUnit({ instanceId: "a", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 0 } }),
    makeUnit({ instanceId: "b", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 1 } }),
    makeUnit({ instanceId: "c", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 2 } }),
  ];
  const ids = getSupplyLineUnitIds(battle, "player");
  check("Линия снабжения: без юнита снабжения не срабатывает", ids.size === 0, `size ${ids.size}`);
}

// 5b. США «Линия снабжения»: line abuts the front column but the only support
//     unit sits in a non-adjacent rear slot (a gap between it and the line's
//     rear cell) → the supply chain is broken, ability does not trigger.
{
  const battle = makeBattle({ playerHq: "training_camp" });
  battle.units = [
    makeUnit({ instanceId: "a", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 0 } }),
    makeUnit({ instanceId: "b", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 1 } }),
    makeUnit({ instanceId: "c", cardId: "t34_76", ownerId: "player", position: { row: 0, col: 2 } }),
    // Slot 3 sits at row 3 — two rows away from the row-0 line's rear cell.
    makeUnit({ instanceId: "s", cardId: "t34_76", ownerId: "player", zone: "support", supportSlot: 3 }),
  ];
  const ids = getSupplyLineUnitIds(battle, "player");
  check("Линия снабжения: снабжение не вплотную к линии не срабатывает", ids.size === 0, `size ${ids.size}`);
}

// 6. Бот «Сплочение»: a Soviet bot with two units in its spawn column and a
//    playable card spends it to complete the vertical line.
{
  const battle = makeBattle({ botHq: "soviet_tank_brigade" });
  battle.activePlayer = "bot";
  battle.headquarters.bot.alreadyAttacked = true;
  battle.bot.resources = 5;
  battle.bot.maxResources = 5;
  // Two thirds of the spawn column already manned (col 4, rows 0 & 1).
  battle.units = [
    makeUnit({ instanceId: "x", cardId: "t34_76", ownerId: "bot", position: { row: 0, col: 4 } }),
    makeUnit({ instanceId: "y", cardId: "t34_76", ownerId: "bot", position: { row: 1, col: 4 } }),
  ];
  // One affordable battlefield card in hand.
  battle.bot.hand = [{ instanceId: "card-z", cardId: "t34_76" }];

  const action = getNextBotAction(battle);
  const completesColumn =
    action?.type === "PLAY_CARD" &&
    "position" in action &&
    action.position.col === 4 &&
    action.position.row === 2;
  check(
    "Бот СССР достраивает колонку «Сплочение»",
    completesColumn,
    `got ${action?.type} ${action && "position" in action ? JSON.stringify(action.position) : ""}`
  );
}

// 7. Бот «Линия снабжения» без врага на поле: with the board clear of enemy
//    units the supply-line buff is pointless, so the US bot must NOT spend its
//    card completing the formation row — it should deploy offensively (closest
//    spawn cell to the enemy HQ) to press the now-open headquarters.
{
  const battle = makeBattle({ botHq: "training_camp" });
  battle.activePlayer = "bot";
  battle.headquarters.bot.alreadyAttacked = true;
  battle.bot.resources = 5;
  battle.bot.maxResources = 5;
  // Two-thirds of a supply row already built (row 0, cols 2 & 3); a fresh unit
  // at the spawn cell (0,4) would complete it. A rear support unit (slot 0) sits
  // adjacent to that rear cell, so the formation is genuinely completable.
  battle.units = [
    makeUnit({ instanceId: "x", cardId: "t34_76", ownerId: "bot", position: { row: 0, col: 3 }, alreadyMoved: true, alreadyAttacked: true }),
    makeUnit({ instanceId: "y", cardId: "t34_76", ownerId: "bot", position: { row: 0, col: 2 }, alreadyMoved: true, alreadyAttacked: true }),
    makeUnit({ instanceId: "s", cardId: "t34_76", ownerId: "bot", zone: "support", supportSlot: 0 }),
  ];
  battle.bot.hand = [{ instanceId: "card-z", cardId: "t34_76" }];

  const action = getNextBotAction(battle);
  const buildsSupplyLine =
    action?.type === "PLAY_CARD" &&
    "position" in action &&
    action.position.row === 0 &&
    action.position.col === 4;
  check(
    "Бот США не строит линию снабжения без врага на поле",
    action?.type === "PLAY_CARD" && !buildsSupplyLine,
    `got ${action?.type} ${action && "position" in action ? JSON.stringify(action.position) : ""}`
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
