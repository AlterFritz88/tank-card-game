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
    action.position.col === 0; // клетка плацдарма игрока
  check(
    "Прорыв: бот идёт на вражеский плацдарм",
    toEnemySpawn,
    `got ${action?.type} ${action && "position" in action ? JSON.stringify(action.position) : ""}`
  );
}

// D. Бронеавтомобиль не расходует остаток движения без тактической цели.
{
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({
      instanceId: "car",
      cardId: "m1_armored_car",
      ownerId: "bot",
      position: { row: 1, col: 2 },
      moveCountThisTurn: 2,
      alreadyAttacked: true,
    })
  );
  const action = getNextBotAction(battle);
  check(
    "Бронеавтомобиль: лишнее продолжение движения подавлено",
    action?.type === "END_TURN",
    `got ${action?.type}`
  );
}

// E. Блиц строит маршрут к ценному юниту в тылу, а не останавливается заранее.
{
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({
      instanceId: "blitz",
      cardId: "bt_5",
      ownerId: "bot",
      position: { row: 0, col: 3 },
      deployedThisTurn: true,
    }),
    makeUnit({
      instanceId: "rear",
      cardId: "gaz_55_ambulance",
      ownerId: "player",
      zone: "support",
      supportSlot: 1,
    })
  );
  const action = getNextBotAction(battle);
  check(
    "Блиц: начинает выгодный проход к тыловому юниту",
    action?.type === "MOVE_UNIT" && action.position.col < 3,
    `got ${action?.type} ${
      action && "position" in action ? JSON.stringify(action.position) : ""
    }`
  );
}

// F. Быстрый юнит обходит ПТ-САУ и атакует с тыла без ответного огня.
{
  let battle = makeBotBattle();
  battle.units.push(
    makeUnit({
      instanceId: "flanker",
      cardId: "bt_5",
      ownerId: "bot",
      position: { row: 1, col: 3 },
      deployedThisTurn: true,
    }),
    makeUnit({
      instanceId: "enemy-td",
      cardId: "panzerjaeger_i",
      ownerId: "player",
      position: { row: 1, col: 1 },
    })
  );

  const route = [] as ReturnType<typeof getNextBotAction>[];
  let attack: ReturnType<typeof getNextBotAction> = null;
  let hpBefore: number | undefined;

  for (let step = 0; step < 6; step += 1) {
    const action = getNextBotAction(battle);
    route.push(action);

    if (action?.type === "MOVE_UNIT") {
      battle = applyAction(battle, action);
      continue;
    }

    if (action?.type === "ATTACK") {
      attack = action;
      hpBefore = battle.units.find(
        (unit) => unit.instanceId === "flanker"
      )?.currentHp;
      battle = applyAction(battle, action);
    }
    break;
  }

  const hpAfter = battle.units.find((unit) => unit.instanceId === "flanker")?.currentHp;
  const moves = route.filter((action) => action?.type === "MOVE_UNIT");

  check(
    "ПТ-САУ: бот выбирает обходной маршрут в тыл",
    moves.length >= 2 &&
      attack?.type === "ATTACK" &&
      attack.targetId === "enemy-td",
    `got ${route.map((action) => action?.type).join(" -> ")}`
  );
  check(
    "ПТ-САУ: атака с тыла проходит без ответного урона",
    hpBefore !== undefined && hpAfter === hpBefore,
    `hp ${hpBefore} -> ${hpAfter}`
  );
}

// G. Counter-battery is deployed when it disables meaningful indirect fire.
{
  const battle = makeBotBattle();
  battle.bot.resources = 10;
  battle.bot.maxResources = 10;
  battle.bot.hand = [
    { instanceId: "counter-card", cardId: "m72_recon" },
    { instanceId: "medic-card", cardId: "gaz_55_ambulance" },
  ];
  battle.units.push(
    makeUnit({
      instanceId: "enemy-spg",
      cardId: "su18",
      ownerId: "player",
      position: { row: 1, col: 1 },
    })
  );

  const action = getNextBotAction(battle);
  check(
    "Counter-battery: bot deploys M-72 against an enemy SPG",
    action?.type === "PLAY_SUPPORT_CARD" &&
      action.cardInstanceId === "counter-card",
    `got ${action?.type} ${
      action && "cardInstanceId" in action ? action.cardInstanceId : ""
    }`
  );
}

// H. Destroying the final enemy emitter takes priority and restores the battery.
{
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({
      instanceId: "striker",
      cardId: "t34_76",
      ownerId: "bot",
      position: { row: 1, col: 2 },
    }),
    makeUnit({
      instanceId: "enemy-counter",
      cardId: "t27",
      ownerId: "player",
      position: { row: 1, col: 1 },
    }),
    makeUnit({
      instanceId: "enemy-tank",
      cardId: "t34_76",
      ownerId: "player",
      position: { row: 0, col: 1 },
    }),
    makeUnit({
      instanceId: "own-spg",
      cardId: "su_122",
      ownerId: "bot",
      position: { row: 0, col: 4 },
      alreadyAttacked: true,
      attackSuppressed: true,
    })
  );

  const action = getNextBotAction(battle);
  check(
    "Counter-battery response: bot attacks the active emitter first",
    action?.type === "ATTACK" && action.targetId === "enemy-counter",
    `got ${action?.type} ${
      action && "targetId" in action ? action.targetId : ""
    }`
  );
}

// I. Under suppression the bot deploys a raider instead of another silent SPG.
{
  const battle = makeBotBattle();
  battle.bot.resources = 10;
  battle.bot.maxResources = 10;
  battle.bot.hand = [
    { instanceId: "silent-spg", cardId: "su_122" },
    { instanceId: "raider-card", cardId: "bt_5" },
  ];
  battle.units.push(
    makeUnit({
      instanceId: "enemy-counter",
      cardId: "m72_recon",
      ownerId: "player",
      zone: "support",
      supportSlot: 1,
    })
  );

  const action = getNextBotAction(battle);
  check(
    "Counter-battery response: bot chooses a mobile raider over a suppressed SPG",
    action?.type === "PLAY_CARD" && action.cardInstanceId === "raider-card",
    `got ${action?.type} ${
      action && "cardInstanceId" in action ? action.cardInstanceId : ""
    }`
  );
}

// J. A mobile unit starts a concrete route toward a rear counter-battery source.
{
  const battle = makeBotBattle();
  battle.units.push(
    makeUnit({
      instanceId: "raider",
      cardId: "bt_5",
      ownerId: "bot",
      position: { row: 0, col: 3 },
      deployedThisTurn: true,
    }),
    makeUnit({
      instanceId: "enemy-counter",
      cardId: "m72_recon",
      ownerId: "player",
      zone: "support",
      supportSlot: 1,
    })
  );

  const action = getNextBotAction(battle);
  check(
    "Counter-battery response: mobile unit starts a raid on the emitter",
    action?.type === "MOVE_UNIT" && action.position.col < 3,
    `got ${action?.type} ${
      action && "position" in action ? JSON.stringify(action.position) : ""
    }`
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
