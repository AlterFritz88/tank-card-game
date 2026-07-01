/* Headless simulation of the guided «Поныри» demo mission.
   Run: npx tsx welcome-kursk-smoke.ts */
import { applyAction, getTargetsInRange } from "./src/game/engine";
import { createInitialBattleState } from "./src/game/initialState";
import { getCampaignMission } from "./src/game/campaigns";
import {
  WELCOME_KURSK_STEPS,
  getNextTutorialStepIndex,
  getTutorialBotAction,
  getTutorialHighlights,
  getTutorialMoveTargetCell,
  getTutorialStep,
  isTutorialActionAllowed,
  isTutorialFreePlay,
} from "./src/game/tutorial";
import type { BattleAction, BattleState, BoardUnit } from "./src/game/types";

const SCRIPT = "welcome_kursk" as const;
let failures = 0;

function check(name: string, condition: boolean, details = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${details}`);
  }
}

const campaign = getCampaignMission("welcome-kursk-1");
if (!campaign) {
  console.error("FAIL  Миссия welcome-kursk-1 не найдена");
  process.exit(1);
}
const mission = campaign.mission;

let state: BattleState = createInitialBattleState({
  playerHeadquartersId:
    mission.playerHeadquartersId ?? campaign.campaign.playerHeadquartersId,
  botHeadquartersId: mission.botHeadquartersId!,
  playerDeckId: mission.playerDeckId ?? campaign.campaign.playerDeckId,
  botDeckId: mission.botDeckId!,
  playerBoardUnits: mission.playerBoardUnits,
  botBoardUnits: mission.botBoardUnits,
  shuffleDecks: false,
});

state = applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });

check("Немецкая колода без контрбатареи (нет sdkfz_231)", !state.bot.deck.some((c) => c.cardId === "sdkfz_231"));
check("Игрок ходит первым", state.activePlayer === "player");

const findUnit = (owner: "player" | "bot", cardId: string): BoardUnit | undefined =>
  state.units.find((u) => u.ownerId === owner && u.cardId === cardId);
const freshSpg = (): BoardUnit | undefined =>
  state.units.find(
    (u) => u.ownerId === "player" && u.cardId === "su_122" && !u.alreadyAttacked
  );
const handCard = (cardId: string) =>
  state.player.hand.find((c) => c.cardId === cardId);

let stepIndex = 0;

function advanceDialogue(expectedId: string) {
  const step = getTutorialStep(SCRIPT, stepIndex);
  check(
    `Диалог ${expectedId} на месте`,
    step?.kind === "dialogue" && step.id === expectedId,
    `actual ${step?.id} (${step?.kind})`
  );
  stepIndex += 1;
}

function playerAct(label: string, expectedId: string, action: BattleAction) {
  const step = getTutorialStep(SCRIPT, stepIndex);
  check(`${label}: активен шаг ${expectedId}`, step?.id === expectedId, `actual ${step?.id}`);
  const allowed = isTutorialActionAllowed(SCRIPT, stepIndex, action, state);
  check(`${label}: действие разрешено`, allowed);
  if (!allowed) return;
  const before = stepIndex;
  stepIndex = getNextTutorialStepIndex(SCRIPT, stepIndex, action, state);
  state = applyAction(state, action);
  check(`${label}: шаг продвинулся`, stepIndex === before + 1, `step ${before} -> ${stepIndex}`);
}

function expectBlocked(label: string, action: BattleAction) {
  check(`${label}: заблокировано`, !isTutorialActionAllowed(SCRIPT, stepIndex, action, state));
}

function runBotTurn(label: string) {
  let guard = 0;
  while (state.status === "active" && state.activePlayer === "bot" && guard < 20) {
    guard += 1;
    const action = getTutorialBotAction(SCRIPT, state);
    if (!action) break;
    check(`${label}: бот только передаёт ход`, action.type === "END_TURN", `got ${action.type}`);
    state = applyAction(state, action);
    if (action.type === "END_TURN") break;
  }
  check(`${label}: ход вернулся игроку`, state.activePlayer === "player" || state.status !== "active");
}

// === Шаг 0: вступление про СУ-122 ===
advanceDialogue("wk-spg-intro");

// Гейтинг: пока не ударили СУ-122 по Тигру — конец хода не завершает шаг,
// а посторонний ход (КВ-1) запрещён.
expectBlocked("Розыгрыш карты вместо удара СУ-122", {
  type: "PLAY_CARD",
  playerId: "player",
  cardInstanceId: handCard("t34_76")!.instanceId,
  position: { row: 1, col: 0 },
});

// === Шаг 1: СУ-122 бьёт по Тигру ===
const spg1 = freshSpg()!;
check("СУ-122 достаёт Тигр", getTargetsInRange(state, "player", "unit", spg1.instanceId).some((t) => t.id === findUnit("bot", "tiger_i")!.instanceId));
playerAct("СУ-122 по Тигру", "wk-spg-tiger", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "unit",
  attackerId: spg1.instanceId,
  targetType: "unit",
  targetId: findUnit("bot", "tiger_i")!.instanceId,
});

// === Шаг 2: второй СУ-122 бьёт по Фердинанду ===
const spg2 = freshSpg()!;
check("Использован другой СУ-122", spg2.instanceId !== spg1.instanceId);
// Пошаговость: подсвечена ровно одна свежая СУ-122 (не обе).
const ferdHl = getTutorialHighlights(SCRIPT, stepIndex, state);
check(
  "На шаге «Фердинанд» подсвечена только свежая СУ-122",
  JSON.stringify(ferdHl?.unitInstanceIds) === JSON.stringify([spg2.instanceId]) &&
    !ferdHl?.unitCardIds,
  JSON.stringify(ferdHl)
);
const spg1Now = state.units.find((u) => u.instanceId === spg1.instanceId)!;
check("Отстрелявшаяся СУ-122 не в подсветке", spg1Now.alreadyAttacked === true && !ferdHl?.unitInstanceIds?.includes(spg1.instanceId));
playerAct("СУ-122 по Фердинанду", "wk-spg-ferdinand", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "unit",
  attackerId: spg2.instanceId,
  targetType: "unit",
  targetId: findUnit("bot", "ferdinand")!.instanceId,
});

// === Шаг 3-4: штаб бьёт по штабу ===
advanceDialogue("wk-hq-intro");
const enemyHqHpBefore = state.headquarters.bot.hp;
playerAct("Штаб по штабу", "wk-hq-strike", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "headquarters",
  attackerId: "player_hq",
  targetType: "headquarters",
  targetId: "bot_hq",
});
check("Штаб врага получил урон", state.headquarters.bot.hp < enemyHqHpBefore, `hp ${state.headquarters.bot.hp}`);

// === Шаг 5-6: Т-34 движется вперёд на подсвеченную клетку ===
advanceDialogue("wk-tank-intro");
const moveCell = getTutorialMoveTargetCell(SCRIPT, stepIndex, state);
check("Есть клетка для хода Т-34", moveCell != null, `${JSON.stringify(moveCell)}`);
playerAct("Ход Т-34 вперёд", "wk-move-t34", {
  type: "MOVE_UNIT",
  playerId: "player",
  unitId: findUnit("player", "t34_76")!.instanceId,
  position: moveCell!,
});

// === Шаг 7: Т-34 бьёт по Panzer III ===
check(
  "Т-34 достаёт Panzer III после хода",
  getTargetsInRange(state, "player", "unit", findUnit("player", "t34_76")!.instanceId).some(
    (t) => t.id === findUnit("bot", "pzkpfw_iii_ausf_f")!.instanceId
  )
);
playerAct("Т-34 по Panzer III", "wk-t34-strike", {
  type: "ATTACK",
  playerId: "player",
  attackerType: "unit",
  attackerId: findUnit("player", "t34_76")!.instanceId,
  targetType: "unit",
  targetId: findUnit("bot", "pzkpfw_iii_ausf_f")!.instanceId,
});

// === Шаг 8: конец хода ===
playerAct("Конец хода 1", "wk-end-turn", { type: "END_TURN", playerId: "player" });

// === Ход бота: пассивен ===
runBotTurn("Бот-1");

// === Шаг 9-10: разыграть Т-34 с руки ===
advanceDialogue("wk-deploy-intro");
const t34Card = handCard("t34_76");
check("Т-34 есть в руке", Boolean(t34Card));
check("Топлива хватает на Т-34", state.player.resources >= 3, `fuel ${state.player.resources}`);
const spawnCell = { row: 1, col: 0 };
playerAct("Разыграть Т-34", "wk-play-t34", {
  type: "PLAY_CARD",
  playerId: "player",
  cardInstanceId: t34Card!.instanceId,
  position: spawnCell,
});

// === Шаг 11: финальный диалог → свободная игра ===
advanceDialogue("wk-finish");
check("Все шаги пройдены", stepIndex === WELCOME_KURSK_STEPS.length);
check("Дальше — свободная игра", isTutorialFreePlay(SCRIPT, stepIndex));

// === Свободная игра: игрок гарантированно добивает штаб врага ===
let turnGuard = 0;
while (state.status === "active" && turnGuard < 60) {
  turnGuard += 1;

  if (state.activePlayer === "player") {
    // Бьём по штабу врага всем, чем можем.
    if (!state.headquarters.player.alreadyAttacked) {
      const hqTargets = getTargetsInRange(state, "player", "headquarters", "player_hq");
      if (hqTargets.some((t) => t.type === "headquarters" && t.id === "bot_hq")) {
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
    }
    for (const unit of state.units.filter((u) => u.ownerId === "player" && u.zone !== "support" && !u.alreadyAttacked)) {
      const targets = getTargetsInRange(state, "player", "unit", unit.instanceId);
      if (targets.some((t) => t.type === "headquarters" && t.id === "bot_hq")) {
        state = applyAction(state, {
          type: "ATTACK",
          playerId: "player",
          attackerType: "unit",
          attackerId: unit.instanceId,
          targetType: "headquarters",
          targetId: "bot_hq",
        });
        if (state.status !== "active") break;
      }
    }
    if (state.status !== "active") break;
    state = applyAction(state, { type: "END_TURN", playerId: "player" });
  } else {
    const action = getTutorialBotAction(SCRIPT, state) ?? { type: "END_TURN", playerId: "bot" };
    state = applyAction(state, action);
  }
}

check("Игрок победил (штаб врага уничтожен)", state.status === "player_won", `status ${state.status}, hqhp ${state.headquarters.bot.hp}`);

console.log(failures === 0 ? "\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : `\n${failures} ПРОВЕРОК ПРОВАЛЕНО`);
process.exit(failures === 0 ? 0 : 1);
