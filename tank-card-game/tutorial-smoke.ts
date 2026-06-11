/* Headless simulation of the full tutorial. Run: npx tsx tutorial-smoke.ts */
import { applyAction, getTargetsInRange, getAvailableMoveCells } from "./src/game/engine";
import { createInitialBattleState } from "./src/game/initialState";
import {
  TUTORIAL_BOT_DECK,
  TUTORIAL_BOT_HEADQUARTERS_ID,
  TUTORIAL_PLAYER_DECK,
  TUTORIAL_PLAYER_HEADQUARTERS_ID,
  TUTORIAL_STEPS,
  getNextTutorialStepIndex,
  getTutorialBotAction,
  getTutorialStep,
  isTutorialActionAllowed,
  isTutorialFreePlay,
} from "./src/game/tutorial";
import type { BattleAction, BattleState } from "./src/game/types";

let failures = 0;

function check(name: string, condition: boolean, details = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${details}`);
  }
}

let state: BattleState = createInitialBattleState({
  playerHeadquartersId: TUTORIAL_PLAYER_HEADQUARTERS_ID,
  botHeadquartersId: TUTORIAL_BOT_HEADQUARTERS_ID,
  playerDeckCardIds: [...TUTORIAL_PLAYER_DECK],
  botDeckCardIds: [...TUTORIAL_BOT_DECK],
  shuffleDecks: false,
});

state = applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });

check(
  "Стартовая рука детерминирована (t24, bt_7, su_5_2 в руке)",
  ["t24", "bt_7", "su_5_2"].every((cardId) =>
    state.player.hand.some((card) => card.cardId === cardId)
  ),
  state.player.hand.map((card) => card.cardId).join(",")
);

let stepIndex = 0;

function advanceDialogue(expectedId: string) {
  const step = getTutorialStep(stepIndex);
  check(
    `Диалог ${expectedId} на месте`,
    step?.kind === "dialogue" && step.id === expectedId,
    `actual ${step?.id} (${step?.kind})`
  );
  stepIndex += 1;
}

function playerAct(label: string, action: BattleAction, expectAdvance = true) {
  const allowed = isTutorialActionAllowed(stepIndex, action, state);
  check(`${label}: действие разрешено`, allowed);
  if (!allowed) return;

  const before = stepIndex;
  stepIndex = getNextTutorialStepIndex(stepIndex, action, state);
  state = applyAction(state, action);

  if (expectAdvance) {
    check(`${label}: шаг продвинулся`, stepIndex === before + 1);
  }
}

function expectBlocked(label: string, action: BattleAction) {
  check(
    `${label}: действие заблокировано`,
    !isTutorialActionAllowed(stepIndex, action, state)
  );
}

function runBotTurn(label: string) {
  let guard = 0;

  while (state.status === "active" && state.activePlayer === "bot" && guard < 30) {
    guard += 1;
    const action = getTutorialBotAction(state);

    if (!action) break;

    state = applyAction(state, action);

    if (action.type === "END_TURN") break;
  }

  check(`${label}: ход бота завершён`, state.activePlayer === "player" || state.status !== "active");
}

const handCard = (cardId: string) =>
  state.player.hand.find((card) => card.cardId === cardId)!;
const findUnit = (owner: "player" | "bot", cardId: string) =>
  state.units.find((unit) => unit.ownerId === owner && unit.cardId === cardId);

// === Ход игрока 1 ===
advanceDialogue("intro-hq");

// Гейтинг: на шаге «выстрели штабом» нельзя разыграть карту.
expectBlocked("Розыгрыш карты до выстрела", {
  type: "PLAY_CARD",
  playerId: "player",
  cardInstanceId: handCard("t24").instanceId,
  position: { row: 1, col: 0 },
});

playerAct("Выстрел штабом по штабу", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "headquarters",
  attackerId: "player_hq",
  targetType: "headquarters",
  targetId: "bot_hq",
});

check("Штаб бота получил урон", state.headquarters.bot.hp === 14, `hp ${state.headquarters.bot.hp}`);

advanceDialogue("hand-fuel");

// Гейтинг позиции: Т-24 нельзя сыграть мимо подсвеченной клетки (1,1).
check(
  "Розыгрыш Т-24 на чужую клетку не засчитывается",
  getNextTutorialStepIndex(
    stepIndex,
    {
      type: "PLAY_CARD",
      playerId: "player",
      cardInstanceId: handCard("t24").instanceId,
      position: { row: 1, col: 0 },
    },
    state
  ) === stepIndex
);

playerAct("Розыгрыш среднего танка на (1,1)", {
  type: "PLAY_CARD",
  playerId: "player",
  cardInstanceId: handCard("t24").instanceId,
  position: { row: 1, col: 1 },
});

advanceDialogue("unit-types");

playerAct("Конец хода 1", { type: "END_TURN", playerId: "player" });

// === Ход бота 1: сначала артиллерия, потом обстрел Т-24 ===
runBotTurn("Бот-1");
const botArtillery = state.units.find(
  (unit) => unit.ownerId === "bot" && unit.cardId === "leig_18"
);
check("Артиллерия бота на линии поддержки", botArtillery?.zone === "support");
check(
  "Т-24 обстрелян (3 урона с бонусом артиллерии), но жив",
  findUnit("player", "t24")?.currentHp === 1,
  `hp ${findUnit("player", "t24")?.currentHp}`
);

// === Ход игрока 2 ===
advanceDialogue("support-line");
advanceDialogue("bt-blitz");

playerAct("Розыгрыш БТ-7 на (2,1)", {
  type: "PLAY_CARD",
  playerId: "player",
  cardInstanceId: handCard("bt_7").instanceId,
  position: { row: 2, col: 1 },
});

const btUnit = findUnit("player", "bt_7")!;
check("БТ-7 готов к действию (блиц)", !btUnit.alreadyMoved && !btUnit.alreadyAttacked);

playerAct("Движение БТ-7 вперёд", {
  type: "MOVE_UNIT",
  playerId: "player",
  unitId: btUnit.instanceId,
  position: { row: 2, col: 3 },
});

// Топлива хватает ровно на САУ: 3 (штаб) + 2 (Т-24) − 2 (БТ) = 3.
check("Осталось 3 топлива на САУ", state.player.resources === 3, `fuel ${state.player.resources}`);

// Гейтинг позиции: СУ-5-2 нельзя сыграть мимо подсвеченной клетки (1,0).
check(
  "Розыгрыш САУ на чужую клетку не засчитывается",
  getNextTutorialStepIndex(
    stepIndex,
    {
      type: "PLAY_CARD",
      playerId: "player",
      cardInstanceId: handCard("su_5_2").instanceId,
      position: { row: 2, col: 1 },
    },
    state
  ) === stepIndex
);

playerAct("Розыгрыш САУ на (1,0)", {
  type: "PLAY_CARD",
  playerId: "player",
  cardInstanceId: handCard("su_5_2").instanceId,
  position: { row: 1, col: 0 },
});

// В ход выхода САУ стрелять не может, а шаг «Конец хода» атаку не разрешает.
expectBlocked("Выстрел САУ в ход выхода", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "unit",
  attackerId: findUnit("player", "su_5_2")!.instanceId,
  targetType: "headquarters",
  targetId: "bot_hq",
});

playerAct("Конец хода 2", { type: "END_TURN", playerId: "player" });

// === Ход бота 2: лёгкий танк (3 здоровья) добивает Т-24 ===
runBotTurn("Бот-2");
check("Т-24 добит лёгким танком", !findUnit("player", "t24"));
check(
  "Лёгкий танк бота (Panzer I B) на поле с 1 HP после ответного огня",
  findUnit("bot", "pzkpfw_i_ausf_b")?.currentHp === 1,
  `hp ${findUnit("bot", "pzkpfw_i_ausf_b")?.currentHp}`
);
check("БТ-7 цел", Boolean(findUnit("player", "bt_7")));

// === Ход игрока 3 ===
advanceDialogue("medium-lost");

playerAct(
  "Движение БТ-7 к линии штаба",
  {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: findUnit("player", "bt_7")!.instanceId,
    position: { row: 2, col: 4 },
  },
  false
);
check("Шаг kill-artillery ещё активен", getTutorialStep(stepIndex)?.id === "kill-artillery");

playerAct("Атака артиллерии", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "unit",
  attackerId: findUnit("player", "bt_7")!.instanceId,
  targetType: "unit",
  targetId: botArtillery!.instanceId,
});

check("Артиллерия уничтожена", !state.units.some((unit) => unit.cardId === "leig_18"));

// Новый шаг: добить лёгкий танк выстрелом штаба.
check("Шаг hq-finish-light активен", getTutorialStep(stepIndex)?.id === "hq-finish-light");

playerAct("Штаб добивает лёгкий танк", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "headquarters",
  attackerId: "player_hq",
  targetType: "unit",
  targetId: findUnit("bot", "pzkpfw_i_ausf_b")!.instanceId,
});

check("Лёгкий танк бота уничтожен", !findUnit("bot", "pzkpfw_i_ausf_b"));

playerAct("Конец хода 3", { type: "END_TURN", playerId: "player" });

// === Ход бота 3 ===
runBotTurn("Бот-3");
check("ПТ-САУ бота на поле", Boolean(findUnit("bot", "panzerjaeger_i")));

// === Ход игрока 4: САУ уже на позиции с хода 2 ===
advanceDialogue("td-rules");

playerAct("САУ уничтожает ПТ-САУ", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "unit",
  attackerId: findUnit("player", "su_5_2")!.instanceId,
  targetType: "unit",
  targetId: findUnit("bot", "panzerjaeger_i")!.instanceId,
});

check("ПТ-САУ уничтожена", !findUnit("bot", "panzerjaeger_i"));

advanceDialogue("finish-him");
check("Дальше — свободная игра", isTutorialFreePlay(stepIndex));
check("Все шаги пройдены по порядку", stepIndex === TUTORIAL_STEPS.length);

// === Свободная игра до победы ===
let guard = 0;

while (state.status === "active" && guard < 40) {
  guard += 1;

  if (state.activePlayer === "bot") {
    runBotTurn(`Бот-${state.turn}`);
    continue;
  }

  // Штаб стреляет по штабу.
  const hqTargets = getTargetsInRange(state, "player", "headquarters", "player_hq");
  if (
    !state.headquarters.player.alreadyAttacked &&
    hqTargets.some((target) => target.type === "headquarters")
  ) {
    state = applyAction(state, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "headquarters",
      attackerId: "player_hq",
      targetType: "headquarters",
      targetId: "bot_hq",
    });
    if (state.status !== "active") break;
  }

  // Все юниты атакуют штаб, если он в зоне; иначе двигаются к нему.
  for (const unit of state.units.filter(
    (item) => item.ownerId === "player" && item.zone !== "support"
  )) {
    const targets = getTargetsInRange(state, "player", "unit", unit.instanceId);
    const hqTarget = targets.find((target) => target.type === "headquarters");

    if (hqTarget && !unit.alreadyAttacked) {
      state = applyAction(state, {
        type: "ATTACK",
        playerId: "player",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: "headquarters",
        targetId: hqTarget.id,
      });
      if (state.status !== "active") break;
      continue;
    }

    if (!unit.alreadyMoved) {
      const cells = getAvailableMoveCells(state, "player", unit.instanceId);
      const best = cells
        .slice()
        .sort(
          (left, right) =>
            Math.abs(left.col - 4) +
            Math.abs(left.row - 0) -
            (Math.abs(right.col - 4) + Math.abs(right.row - 0))
        )[0];

      if (best) {
        state = applyAction(state, {
          type: "MOVE_UNIT",
          playerId: "player",
          unitId: unit.instanceId,
          position: best,
        });
      }
    }
  }

  if (state.status !== "active") break;

  state = applyAction(state, { type: "END_TURN", playerId: "player" });
}

check("Игрок победил", state.status === "player_won", `status ${state.status}, turn ${state.turn}`);
check(
  "Штаб игрока цел",
  state.headquarters.player.hp > 0,
  `hp ${state.headquarters.player.hp}`
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
