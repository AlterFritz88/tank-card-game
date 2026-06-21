/* Smoke test for bot handling of the new mechanics. Run: npx tsx bot-smoke.ts */
import { createInitialBattleState } from "./src/game/initialState";
import { applyAction } from "./src/game/engine";
import { getNextBotAction } from "./src/game/bot";
import { getCard } from "./src/game/cards";
import type { BattleState, BoardUnit, Position } from "./src/game/types";

let failures = 0;

function check(name: string, condition: boolean, details = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${details}`);
  }
}

function makeBotBattle(): BattleState {
  const state = createInitialBattleState({
    botDeckCardIds: Array.from({ length: 40 }, () => "t34_76"),
  });
  const begun = applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "bot" });

  // Isolate movement: no cards to play, bot HQ has spent its attack.
  begun.bot.hand = [];
  begun.activePlayer = "bot";
  begun.headquarters.bot.alreadyAttacked = true;

  return begun;
}

function makeUnit(
  partial: Partial<BoardUnit> & { instanceId: string; cardId: string; ownerId: "player" | "bot" }
): BoardUnit {
  const card = getCard(partial.cardId);
  return {
    position: { row: 1, col: 2 },
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

const isCorner = (p: Position) =>
  [
    { row: 0, col: 0 },
    { row: 0, col: 4 },
    { row: 2, col: 0 },
    { row: 2, col: 4 },
  ].some((c) => c.row === p.row && c.col === p.col);

// A. Лёгкий танк не делает бессмысленный ВТОРОЙ шаг.
{
  // moveCountThisTurn=1, целей нет, угроз нет → бот не двигает повторно.
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({ instanceId: "lt", cardId: "m2_light_tank", ownerId: "bot", position: { row: 0, col: 2 }, moveCountThisTurn: 1 })
  );
  const action = getNextBotAction(battle);
  check(
    "Лёгкий: бессмысленный второй шаг подавлен (END_TURN)",
    action?.type === "END_TURN",
    `got ${action?.type} ${JSON.stringify(action && "position" in action ? action.position : "")}`
  );

  // Контроль: первый шаг (moveCount=0) допустим — бот продвигается.
  const battle2 = makeBotBattle();
  battle2.units.push(
    makeUnit({ instanceId: "lt", cardId: "m2_light_tank", ownerId: "bot", position: { row: 0, col: 2 }, moveCountThisTurn: 0 })
  );
  const action2 = getNextBotAction(battle2);
  check(
    "Контроль: первый шаг лёгкого допустим (MOVE_UNIT)",
    action2?.type === "MOVE_UNIT",
    `got ${action2?.type}`
  );
}

// B. САУ с «Огневой позицией» едет в угол.
{
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({
      instanceId: "spg",
      cardId: "su_122", // cornerBonus hp:2
      ownerId: "bot",
      position: { row: 1, col: 4 },
      alreadyAttacked: true, // не может стрелять — остаётся репозиция
    })
  );
  const action = getNextBotAction(battle);
  const movedToCorner =
    action?.type === "MOVE_UNIT" && "position" in action && isCorner(action.position);
  check(
    "САУ: едет в угловую клетку (Огневая позиция)",
    movedToCorner,
    `got ${action?.type} ${action && "position" in action ? JSON.stringify(action.position) : ""}`
  );
}

// C. «Прорыв»: бот ведёт юнит на плацдарм противника.
{
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({ instanceId: "raider", cardId: "panzer_35t", ownerId: "bot", position: { row: 2, col: 2 } })
  );
  const action = getNextBotAction(battle);
  const toEnemySpawn =
    action?.type === "MOVE_UNIT" &&
    "position" in action &&
    action.position.row === 2 &&
    action.position.col === 1; // клетка плацдарма игрока
  check(
    "Прорыв: бот идёт на вражеский плацдарм",
    toEnemySpawn,
    `got ${action?.type} ${action && "position" in action ? JSON.stringify(action.position) : ""}`
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
