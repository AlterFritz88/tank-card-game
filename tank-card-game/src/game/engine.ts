import { getCard } from "./cards";
import { getHeadquartersAbility } from "./headquarters";
import type {
  AttackAction,
  BattleAction,
  BattleState,
  BoardUnit,
  HeadquartersAbility,
  HeadquartersAbilityTracking,
  HeadquartersState,
  PlayerId,
  Position,
  SupportSlot,
  TankCard,
  TankClass,
} from "./types";

const STEP_TIME_MS = 60 * 1000;
const STARTING_HAND_SIZE = 5;
const SECOND_PLAYER_EXTRA_STARTING_CARDS = 1;

export const SUPPORT_SLOTS: SupportSlot[] = [0, 1, 2];

export const PLAYER_SPAWN_CELLS: Position[] = [
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 2, col: 1 },
];

export const BOT_SPAWN_CELLS: Position[] = [
  { row: 0, col: 3 },
  { row: 1, col: 3 },
  { row: 1, col: 4 },
];

/** The four corner cells of the 3×5 battlefield (see «Огневая позиция»). */
export const BOARD_CORNER_CELLS: Position[] = [
  { row: 0, col: 0 },
  { row: 0, col: 4 },
  { row: 2, col: 0 },
  { row: 2, col: 4 },
];

function cloneState(state: BattleState): BattleState {
  return structuredClone(state);
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isSpawnCell(playerId: PlayerId, position: Position): boolean {
  const spawnCells =
    playerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;

  return spawnCells.some((cell) => samePosition(cell, position));
}

function isCornerCell(position: Position): boolean {
  return BOARD_CORNER_CELLS.some((cell) => samePosition(cell, position));
}

function isCellOccupied(state: BattleState, position: Position): boolean {
  const unitOnCell = state.units.some((unit) =>
    isBattlefieldUnit(unit) &&
    samePosition(unit.position, position)
  );

  const playerHq = samePosition(state.headquarters.player.position, position);
  const botHq = samePosition(state.headquarters.bot.position, position);

  return unitOnCell || playerHq || botHq;
}

export function isSupportUnit(unit: BoardUnit): boolean {
  return unit.zone === "support";
}

export function isBattlefieldUnit(unit: BoardUnit): boolean {
  return !isSupportUnit(unit);
}

function isSupportSlotOccupied(
  state: BattleState,
  playerId: PlayerId,
  supportSlot: SupportSlot
): boolean {
  return state.units.some(
    (unit) =>
      unit.ownerId === playerId &&
      isSupportUnit(unit) &&
      unit.supportSlot === supportSlot
  );
}

function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === "player" ? "bot" : "player";
}

function getPlayerLabel(playerId: PlayerId): string {
  return playerId === "player" ? "Игрок" : "Бот";
}

function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function chebyshevDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function rowDiff(a: Position, b: Position): number {
  return Math.abs(a.row - b.row);
}

function colDiff(a: Position, b: Position): number {
  return Math.abs(a.col - b.col);
}

function isDiagonalMove(from: Position, to: Position): boolean {
  return rowDiff(from, to) === 1 && colDiff(from, to) === 1;
}

function isStraightMove(from: Position, to: Position): boolean {
  return (
    (rowDiff(from, to) > 0 && colDiff(from, to) === 0) ||
    (rowDiff(from, to) === 0 && colDiff(from, to) > 0)
  );
}

function isAdjacentAnyDirection(from: Position, to: Position): boolean {
  return chebyshevDistance(from, to) === 1;
}

function getIntermediateCell(from: Position, to: Position): Position | null {
  const manhattan = manhattanDistance(from, to);
  if (manhattan !== 2) return null;

  if (!isStraightMove(from, to)) return null;

  const dRow = Math.sign(to.row - from.row);
  const dCol = Math.sign(to.col - from.col);

  return {
    row: from.row + dRow,
    col: from.col + dCol,
  };
}

function isPathClear(state: BattleState, from: Position, to: Position): boolean {
  const intermediate = getIntermediateCell(from, to);
  if (!intermediate) return true;

  return !isCellOccupied(state, intermediate);
}

function addLog(state: BattleState, message: string) {
  state.log = [message, ...state.log].slice(0, 12);
}

function ensureBattleStats(state: BattleState) {
  state.stats ??= {
    destroyedByPlayer: {
      light: 0,
      medium: 0,
      heavy: 0,
      td: 0,
      spg: 0,
      support: 0,
    },
    destroyedByBot: {
      light: 0,
      medium: 0,
      heavy: 0,
      td: 0,
      spg: 0,
      support: 0,
    },
  };

  state.stats.destroyedByPlayer.support ??= 0;
  state.stats.destroyedByBot.support ??= 0;
}

function recordDestroyedUnit(
  state: BattleState,
  destroyedBy: PlayerId,
  unit: BoardUnit
) {
  ensureBattleStats(state);

  const card = getCard(unit.cardId);
  const stats =
    destroyedBy === "player"
      ? state.stats.destroyedByPlayer
      : state.stats.destroyedByBot;

  const statKey = isSupportUnit(unit) ? "support" : card.class;

  stats[statKey] += 1;
}

function getAbility(
  state: BattleState,
  playerId: PlayerId
): HeadquartersAbility | null {
  return getHeadquartersAbility(state[playerId].headquartersId);
}

function getAbilityTracking(
  state: BattleState,
  playerId: PlayerId
): HeadquartersAbilityTracking {
  const player = state[playerId];

  if (!player.abilityTracking) {
    player.abilityTracking = {
      unitsPlayedThisTurn: 0,
      tanksPlayedThisTurn: 0,
      lightUnitsPlayedThisTurn: 0,
      destroyedUnitReturnedThisBattle: false,
    };
  }

  return player.abilityTracking;
}

function resetAbilityTurnCounters(state: BattleState, playerId: PlayerId) {
  const tracking = getAbilityTracking(state, playerId);

  tracking.unitsPlayedThisTurn = 0;
  tracking.tanksPlayedThisTurn = 0;
  tracking.lightUnitsPlayedThisTurn = 0;
}

/**
 * Effective fuel cost of playing a card, including headquarters ability
 * discounts (e.g. «Моторизованный марш»: the first unit each turn is cheaper).
 * Used by the engine when charging fuel and by the bot AI when planning.
 */
export function getEffectiveCardCost(
  state: BattleState,
  playerId: PlayerId,
  cardId: string
): number {
  const card = getCard(cardId);
  const ability = getAbility(state, playerId);
  const unitsPlayedThisTurn =
    state[playerId].abilityTracking?.unitsPlayedThisTurn ?? 0;
  const discount =
    ability?.firstUnitFuelDiscount && unitsPlayedThisTurn === 0
      ? ability.firstUnitFuelDiscount
      : 0;

  // «Слаженность»: cheaper while a battlefield unit of the required class is present.
  let classDiscount = 0;
  const costMod = card.costModifiers;

  if (costMod) {
    const hasClassOnField = state.units.some(
      (unit) =>
        unit.ownerId === playerId &&
        isBattlefieldUnit(unit) &&
        getCard(unit.cardId).class === costMod.ifClassPresent
    );

    if (hasClassOnField) classDiscount = costMod.discount;
  }

  return Math.max(0, card.cost - discount - classDiscount);
}

function isTankClassCard(card: TankCard): boolean {
  return (
    card.deploymentZone !== "support" &&
    (card.class === "light" || card.class === "medium" || card.class === "heavy")
  );
}

function calculateFuelGeneration(
  state: BattleState,
  playerId: PlayerId
): number {
  const headquartersFuel = state.headquarters[playerId].fuelGeneration;

  const unitsFuel = state.units
    .filter((unit) => unit.ownerId === playerId)
    .reduce((total, unit) => {
      const card = getCard(unit.cardId);
      const generatedFuel = isSupportUnit(unit)
        ? card.supportEffects?.fuelPerTurn ?? 0
        : card.fuelGeneration;

      return total + generatedFuel;
    }, 0);

  // Combined Arms: extra fuel while controlling both a tank and a support unit.
  const ability = getAbility(state, playerId);
  let abilityFuel = 0;

  if (ability?.combinedArmsFuelBonus) {
    const ownUnits = state.units.filter((unit) => unit.ownerId === playerId);
    const hasTank = ownUnits.some(
      (unit) => isBattlefieldUnit(unit) && isTankClassCard(getCard(unit.cardId))
    );
    const hasSupport = ownUnits.some((unit) => isSupportUnit(unit));

    if (hasTank && hasSupport) {
      abilityFuel = ability.combinedArmsFuelBonus;
    }
  }

  return headquartersFuel + unitsFuel + abilityFuel;
}

function getSupportUnits(state: BattleState, playerId: PlayerId): BoardUnit[] {
  return state.units.filter(
    (unit) => unit.ownerId === playerId && isSupportUnit(unit)
  );
}

/**
 * Battlefield unit that screens friendly light tanks (combatAbilities
 * lightScreen): redirects the first strike per turn aimed at a friendly light
 * tank into itself. Returns null when the target is not a light tank, the
 * screen already fired this turn, or no live screen is present.
 */
function findLightScreenUnit(
  state: BattleState,
  target: BoardUnit
): BoardUnit | null {
  if (getCard(target.cardId).class !== "light") return null;
  if (getCard(target.cardId).combatAbilities?.lightScreen) return null;

  return (
    state.units.find(
      (unit) =>
        unit.ownerId === target.ownerId &&
        isBattlefieldUnit(unit) &&
        unit.instanceId !== target.instanceId &&
        unit.currentHp > 0 &&
        !unit.coverFiredThisTurn &&
        getCard(unit.cardId).combatAbilities?.lightScreen === true
    ) ?? null
  );
}

/** Live anti-tank gun screening this side's support line, if any. */
function getSupportCoverUnit(
  state: BattleState,
  ownerId: PlayerId
): BoardUnit | null {
  return (
    getSupportUnits(state, ownerId).find(
      (unit) =>
        unit.currentHp > 0 &&
        (getCard(unit.cardId).supportEffects?.supportLineCover ?? 0) > 0
    ) ?? null
  );
}

function applySupportTurnEffects(state: BattleState, playerId: PlayerId) {
  const supportUnits = getSupportUnits(state, playerId);
  const battlefieldUnits = state.units.filter(
    (unit) => unit.ownerId === playerId && isBattlefieldUnit(unit)
  );

  for (const supportUnit of supportUnits) {
    const card = getCard(supportUnit.cardId);
    const effects = card.supportEffects;

    if (!effects) continue;

    if (effects.drawEveryTurns && state.turn % effects.drawEveryTurns === 0) {
      drawCardsWithEmptyDeckPenalty(state, playerId, 1);

      if (state.status !== "active") return;
    }

    if (
      effects.fetchSupportCardEveryTurns &&
      state.turn % effects.fetchSupportCardEveryTurns === 0
    ) {
      const player = state[playerId];
      const supportCardsInDeck = player.deck.filter(
        (item) => getCard(item.cardId).deploymentZone === "support"
      );
      const fetched =
        supportCardsInDeck[
          Math.floor(Math.random() * supportCardsInDeck.length)
        ];

      if (fetched) {
        player.hand.push(fetched);
        player.deck = player.deck.filter(
          (item) => item.instanceId !== fetched.instanceId
        );

        addLog(
          state,
          `${getCard(supportUnit.cardId).name}: ${getCard(fetched.cardId).name} доставлена в руку.`
        );
      }
    }

    if (effects.hqHealPerTurn) {
      state.headquarters[playerId].hp += effects.hqHealPerTurn;
    }

    if (effects.healRandomUnitPerTurn) {
      const damagedUnits = battlefieldUnits.filter((unit) => {
        const unitCard = getCard(unit.cardId);

        return (
          unit.currentHp < unitCard.hp &&
          (!effects.healClass || unitCard.class === effects.healClass)
        );
      });
      const target =
        damagedUnits[Math.floor(Math.random() * damagedUnits.length)];

      if (target) {
        const targetCard = getCard(target.cardId);
        target.currentHp = Math.min(
          targetCard.hp,
          target.currentHp + effects.healRandomUnitPerTurn
        );
      }
    }
  }
}

function applyHeadquartersTurnAbility(state: BattleState, playerId: PlayerId) {
  const ability = getAbility(state, playerId);

  if (!ability) return;

  if (ability.drawEveryTurns && state.turn % ability.drawEveryTurns === 0) {
    const drawnCount = drawCardsWithEmptyDeckPenalty(state, playerId, 1);

    if (drawnCount > 0) {
      addLog(
        state,
        `${ability.name}: ${getPlayerLabel(playerId).toLowerCase()} добирает дополнительную карту.`
      );
    }

    if (state.status !== "active") return;
  }

  if (ability.healRandomUnitPerTurn) {
    const damagedUnits = state.units.filter((unit) => {
      if (unit.ownerId !== playerId || !isBattlefieldUnit(unit)) return false;

      return unit.currentHp < getCard(unit.cardId).hp;
    });
    const target =
      damagedUnits[Math.floor(Math.random() * damagedUnits.length)];

    if (target) {
      const targetCard = getCard(target.cardId);

      target.currentHp = Math.min(
        targetCard.hp,
        target.currentHp + ability.healRandomUnitPerTurn
      );

      addLog(
        state,
        `${ability.name}: ${targetCard.name} восстанавливает ${ability.healRandomUnitPerTurn} прочности.`
      );
    }
  }
}

function spendFuel(
  state: BattleState,
  playerId: PlayerId,
  amount: number,
  actionName: string
): boolean {
  const player = state[playerId];

  if (player.resources < amount) {
    addLog(
      state,
      `${
        playerId === "player" ? "Игроку" : "Боту"
      } не хватает топлива: ${actionName} стоит ${amount}.`
    );

    return false;
  }

  player.resources -= amount;

  return true;
}

function resetStepTimer(state: BattleState, playerId: PlayerId) {
  state.timers[playerId].stepTimeLeftMs = STEP_TIME_MS;
  state.timers[playerId].actedThisStep = false;
}

function markSuccessfulAction(state: BattleState, playerId: PlayerId) {
  state.timers[playerId].idleStreak = 0;
  resetStepTimer(state, playerId);
}

function setWinnerByLoser(state: BattleState, loserId: PlayerId, reason: string) {
  state.status = loserId === "player" ? "bot_won" : "player_won";

  addLog(
    state,
    loserId === "player"
      ? `Игрок проиграл: ${reason}`
      : `Бот проиграл: ${reason}`
  );
}

function damageHeadquartersFromEmptyDeck(
  state: BattleState,
  playerId: PlayerId
) {
  const headquarters = state.headquarters[playerId];

  headquarters.hp -= 1;

  addLog(
    state,
    `${
      playerId === "player" ? "Игрок" : "Бот"
    } не может добрать карту: колода пуста. Штаб получает 1 урон.`
  );

  if (headquarters.hp <= 0) {
    state.status = playerId === "player" ? "bot_won" : "player_won";

    addLog(
      state,
      playerId === "player"
        ? "Штаб игрока уничтожен. Бот победил."
        : "Штаб бота уничтожен. Игрок победил."
    );
  }
}

function drawOneCardWithoutPenalty(state: BattleState, playerId: PlayerId) {
  const player = state[playerId];
  const drawnCard = player.deck[0];

  if (!drawnCard) {
    return false;
  }

  player.hand.push(drawnCard);
  player.deck = player.deck.slice(1);

  return true;
}

function drawCardsWithoutPenalty(
  state: BattleState,
  playerId: PlayerId,
  count: number
) {
  let drawnCount = 0;

  for (let index = 0; index < count; index += 1) {
    const drawn = drawOneCardWithoutPenalty(state, playerId);

    if (!drawn) break;

    drawnCount += 1;
  }

  return drawnCount;
}

function drawCardsWithEmptyDeckPenalty(
  state: BattleState,
  playerId: PlayerId,
  count: number
) {
  let drawnCount = 0;

  for (let index = 0; index < count; index += 1) {
    if (drawOneCardWithoutPenalty(state, playerId)) {
      drawnCount += 1;
      continue;
    }

    damageHeadquartersFromEmptyDeck(state, playerId);

    if (state.status !== "active") break;
  }

  return drawnCount;
}

function beginBattle(
  state: BattleState,
  action: Extract<BattleAction, { type: "BEGIN_BATTLE" }>
) {
  if (state.status !== "starting") return;

  const startingPlayer = action.startingPlayer;
  const secondPlayer = getOpponent(startingPlayer);

  state.status = "active";
  state.activePlayer = startingPlayer;
  state.turn = 1;

  for (const owner of ["player", "bot"] as const) {
    const generatedFuel = calculateFuelGeneration(state, owner);

    state[owner].maxResources = generatedFuel;
    state[owner].resources = generatedFuel;

    resetStepTimer(state, owner);
    state.timers[owner].idleStreak = 0;
    state.timers[owner].actedThisStep = false;

    state.headquarters[owner].alreadyAttacked = false;

    resetAbilityTurnCounters(state, owner);
    getAbilityTracking(state, owner).destroyedUnitReturnedThisBattle = false;
  }

  for (const unit of state.units) {
    unit.alreadyAttacked = isSupportUnit(unit);
    unit.alreadyMoved = isSupportUnit(unit);
    unit.spawnedThisTurn = false;
    unit.moveCountThisTurn = 0;
    unit.tdAmbushUsedThisTurn = false;
    unit.coverFiredThisTurn = false;
    unit.drawWhenAttackedUsedThisTurn = false;
  }

  const startingPlayerDrawnCards = drawCardsWithoutPenalty(
    state,
    startingPlayer,
    STARTING_HAND_SIZE
  );

  const secondPlayerDrawnCards = drawCardsWithoutPenalty(
    state,
    secondPlayer,
    STARTING_HAND_SIZE + SECOND_PLAYER_EXTRA_STARTING_CARDS
  );

  addLog(
    state,
    `Первым ходит ${startingPlayer === "player" ? "игрок" : "бот"}.`
  );

  addLog(
    state,
    `${
      startingPlayer === "player" ? "Игрок" : "Бот"
    } получает стартовую руку: ${startingPlayerDrawnCards} карты.`
  );

  addLog(
    state,
    `${
      secondPlayer === "player" ? "Игрок" : "Бот"
    } получает стартовую руку и бонус за второй ход: ${secondPlayerDrawnCards} карты.`
  );
}

function startTurn(state: BattleState, playerId: PlayerId) {
  const player = state[playerId];

  const generatedFuel = calculateFuelGeneration(state, playerId);

  player.maxResources = generatedFuel;
  player.resources = generatedFuel;

  resetStepTimer(state, playerId);

  addLog(
    state,
    `${
      playerId === "player" ? "Игрок" : "Бот"
    } получает ${generatedFuel} топлива.`
  );

  const drawnCard = player.deck[0];

  if (drawnCard) {
    player.hand.push(drawnCard);
    player.deck = player.deck.slice(1);

    addLog(state, `${playerId === "player" ? "Игрок" : "Бот"} добирает карту.`);
  } else {
    damageHeadquartersFromEmptyDeck(state, playerId);

    if (state.status !== "active") {
      return;
    }
  }

  applySupportTurnEffects(state, playerId);

  if (state.status !== "active") {
    return;
  }

  applyHeadquartersTurnAbility(state, playerId);

  if (state.status !== "active") {
    return;
  }

  resetAbilityTurnCounters(state, playerId);

  for (const unit of state.units) {
    unit.tdAmbushUsedThisTurn = false;
    unit.coverFiredThisTurn = false;
    unit.drawWhenAttackedUsedThisTurn = false;

    if (unit.ownerId === playerId) {
      unit.alreadyAttacked = isSupportUnit(unit);
      unit.alreadyMoved = isSupportUnit(unit);
      unit.spawnedThisTurn = false;
      unit.moveCountThisTurn = 0;
    }
  }

  state.headquarters[playerId].alreadyAttacked = false;
}

/**
 * «Огневой налёт»: a freshly deployed unit shells enemy battlefield units —
 * either one random target or every enemy unit of the listed classes. Still
 * hidden «Маскировка» units are skipped (this is indirect fire, not melee).
 */
function applyDeployDamage(
  state: BattleState,
  ownerId: PlayerId,
  sourceCard: TankCard,
  deployDamage: NonNullable<
    NonNullable<TankCard["onPlayEffects"]>["deployDamage"]
  >
) {
  const opponent = getOpponent(ownerId);
  const candidates = state.units.filter((unit) => {
    if (unit.ownerId !== opponent || !isBattlefieldUnit(unit)) return false;
    if (unit.currentHp <= 0) return false;

    const unitCard = getCard(unit.cardId);
    return !(unitCard.combatAbilities?.camouflage && !unit.revealed);
  });

  let targets: BoardUnit[];

  if (deployDamage.scope === "classes") {
    const classes = deployDamage.classes ?? [];
    targets = candidates.filter((unit) =>
      classes.includes(getCard(unit.cardId).class)
    );
  } else {
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    targets = target ? [target] : [];
  }

  for (const target of targets) {
    target.currentHp -= deployDamage.amount;

    addLog(
      state,
      `${sourceCard.name}: огневой налёт — ${
        getCard(target.cardId).name
      } получает ${deployDamage.amount} урона.`
    );

    if (target.currentHp <= 0) {
      destroyUnit(state, target, "уничтожен огневым налётом.", ownerId);
    }
  }
}

function playCard(
  state: BattleState,
  action: Extract<BattleAction, { type: "PLAY_CARD" }>
) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;
  if (!isSpawnCell(action.playerId, action.position)) return;
  if (isCellOccupied(state, action.position)) return;

  const player = state[action.playerId];

  const cardInHand = player.hand.find(
    (card) => card.instanceId === action.cardInstanceId
  );

  if (!cardInHand) return;

  const card = getCard(cardInHand.cardId);
  if (card.deploymentZone === "support") return;

  const ability = getAbility(state, action.playerId);
  const tracking = getAbilityTracking(state, action.playerId);

  // Motorized march: the first unit played each turn costs less fuel.
  const fuelCost = getEffectiveCardCost(state, action.playerId, card.id);
  const fuelDiscount = card.cost - fuelCost;

  if (!spendFuel(state, action.playerId, fuelCost, "размещение юнита")) {
    return;
  }

  player.hand = player.hand.filter(
    (item) => item.instanceId !== action.cardInstanceId
  );

  const isLightTank = card.class === "light";

  // Headquarters abilities can grant blitz on top of the card's own ability.
  const abilityBlitz =
    (ability?.firstTankBlitz === true &&
      tracking.tanksPlayedThisTurn === 0 &&
      isTankClassCard(card)) ||
    (ability?.lightUnitsBlitz === true && isLightTank);
  const hasBlitz = card.combatAbilities?.blitz === true || abilityBlitz;
  const canActAfterSpawn = isLightTank || hasBlitz;

  const unit: BoardUnit = {
    instanceId: action.cardInstanceId,
    cardId: card.id,
    ownerId: action.playerId,
    position: action.position,
    zone: "battlefield",
    currentHp: card.hp,

    alreadyAttacked: !canActAfterSpawn,
    alreadyMoved: !canActAfterSpawn,
    spawnedThisTurn: isLightTank && !hasBlitz,
    moveCountThisTurn: 0,
    tdAmbushUsedThisTurn: false,
  };

  state.units.push(unit);

  // Apply on-play effects (new mechanics for low-stat units)
  if (card.onPlayEffects) {
    const effects = card.onPlayEffects;
    const owner = action.playerId;

    // Card draw
    if (effects.draw && effects.draw > 0) {
      const drawnCount = drawCardsWithEmptyDeckPenalty(
        state,
        owner,
        effects.draw
      );

      if (drawnCount > 0) {
        addLog(state, `${owner === "player" ? "Игрок" : "Бот"} добирает карту (Разведка).`);
      }

      if (state.status !== "active") return;
    }

    // HQ protection reinforces the headquarters immediately.
    if (effects.hqProtection && effects.hqProtection > 0) {
      const hq = state.headquarters[owner];
      hq.hp += effects.hqProtection;
      addLog(state, `${owner === "player" ? "Игрок" : "Бот"} укрепляет штаб на +${effects.hqProtection}.`);
    }

    // «Контрбатарейный огонь»: silence the enemy headquarters and SPGs.
    if (effects.suppressEnemyIndirect) {
      const opponent = getOpponent(owner);

      state.headquarters[opponent].attackSuppressed = true;

      for (const enemyUnit of state.units) {
        if (
          enemyUnit.ownerId === opponent &&
          isBattlefieldUnit(enemyUnit) &&
          getCard(enemyUnit.cardId).class === "spg"
        ) {
          enemyUnit.attackSuppressed = true;
        }
      }

      addLog(
        state,
        `${card.name}: контрбатарейный огонь — САУ и штаб противника не могут атаковать.`
      );
    }

    // «Огневой налёт»: deal damage to enemy battlefield units on deploy.
    if (effects.deployDamage && effects.deployDamage.amount > 0) {
      applyDeployDamage(state, owner, card, effects.deployDamage);
    }
  }

  // Armored escort: the first light unit each turn reinforces the headquarters.
  if (
    ability?.firstLightUnitHqProtection &&
    isLightTank &&
    tracking.lightUnitsPlayedThisTurn === 0
  ) {
    state.headquarters[action.playerId].hp += ability.firstLightUnitHqProtection;

    addLog(
      state,
      `${ability.name}: штаб укреплён на +${ability.firstLightUnitHqProtection}.`
    );
  }

  if (fuelDiscount > 0) {
    addLog(state, `${ability?.name}: скидка ${fuelDiscount} топлива.`);
  }

  if (abilityBlitz && card.combatAbilities?.blitz !== true) {
    addLog(state, `${ability?.name}: ${card.name} получает «Блиц».`);
  }

  tracking.unitsPlayedThisTurn += 1;
  if (isTankClassCard(card)) tracking.tanksPlayedThisTurn += 1;
  if (isLightTank) tracking.lightUnitsPlayedThisTurn += 1;

  markSuccessfulAction(state, action.playerId);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} размещает ${
      card.name
    } за ${fuelCost} топлива на [${action.position.row},${
      action.position.col
    }].`
  );
}

function playSupportCard(
  state: BattleState,
  action: Extract<BattleAction, { type: "PLAY_SUPPORT_CARD" }>
) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;
  if (!SUPPORT_SLOTS.includes(action.supportSlot)) return;
  if (isSupportSlotOccupied(state, action.playerId, action.supportSlot)) return;

  const player = state[action.playerId];
  const cardInHand = player.hand.find(
    (card) => card.instanceId === action.cardInstanceId
  );

  if (!cardInHand) return;

  const card = getCard(cardInHand.cardId);

  if (card.deploymentZone !== "support" || !card.supportRole) return;

  const ability = getAbility(state, action.playerId);
  const tracking = getAbilityTracking(state, action.playerId);
  const fuelCost = getEffectiveCardCost(state, action.playerId, card.id);
  const fuelDiscount = card.cost - fuelCost;

  if (!spendFuel(state, action.playerId, fuelCost, "support deployment")) {
    return;
  }

  if (fuelDiscount > 0) {
    addLog(state, `${ability?.name}: скидка ${fuelDiscount} топлива.`);
  }

  tracking.unitsPlayedThisTurn += 1;

  player.hand = player.hand.filter(
    (item) => item.instanceId !== action.cardInstanceId
  );

  state.units.push({
    instanceId: action.cardInstanceId,
    cardId: card.id,
    ownerId: action.playerId,
    position: state.headquarters[action.playerId].position,
    zone: "support",
    supportSlot: action.supportSlot,
    currentHp: card.hp,
    alreadyAttacked: true,
    alreadyMoved: true,
    spawnedThisTurn: true,
    moveCountThisTurn: 0,
    tdAmbushUsedThisTurn: false,
  });

  markSuccessfulAction(state, action.playerId);
}

function getAttacker(state: BattleState, action: AttackAction) {
  if (action.attackerType === "headquarters") {
    return state.headquarters[action.playerId];
  }

  return state.units.find((unit) => unit.instanceId === action.attackerId);
}

function getTarget(state: BattleState, action: AttackAction) {
  if (action.targetType === "headquarters") {
    const opponent = getOpponent(action.playerId);
    return state.headquarters[opponent];
  }

  return state.units.find((unit) => unit.instanceId === action.targetId);
}

function getAttackValue(
  state: BattleState,
  attacker: ReturnType<typeof getAttacker>
): number {
  if (!attacker) return 0;

  if ("cardId" in attacker) {
    return getUnitAttackValue(state, attacker);
  }

  return getHeadquartersAttackValue(state, attacker.ownerId);
}

/**
 * Effective firepower of a battlefield unit, accounting for «Корректировщик»
 * (attack equals the owner's headquarters attack) and «Огневая позиция» (an SPG
 * standing on a board corner fires harder). Support units keep their printed
 * attack (they never strike anyway).
 */
export function getUnitAttackValue(state: BattleState, unit: BoardUnit): number {
  const card = getCard(unit.cardId);

  let attack = card.combatAbilities?.attackEqualsHq
    ? getHeadquartersAttackValue(state, unit.ownerId)
    : card.attack;

  if (
    card.class === "spg" &&
    isBattlefieldUnit(unit) &&
    isCornerCell(unit.position)
  ) {
    attack += card.combatAbilities?.cornerBonus?.attack ?? 0;
  }

  attack += getHqProximityBonus(state, unit);

  return Math.max(0, attack);
}

/**
 * «Огневой вал»: an SPG fires harder the closer it stands to the enemy
 * headquarters. The bonus is `maxBonus` at point-blank range (an adjacent cell)
 * and drops by 1 per extra cell of distance, never below zero.
 */
function getHqProximityBonus(state: BattleState, unit: BoardUnit): number {
  const proximity = getCard(unit.cardId).combatAbilities?.hqProximityBonus;

  if (!proximity) return 0;
  if (!isBattlefieldUnit(unit)) return 0;

  const enemyHq = state.headquarters[getOpponent(unit.ownerId)];
  const distance = chebyshevDistance(unit.position, enemyHq.position);

  return Math.max(0, proximity.maxBonus - (distance - 1));
}

/**
 * «Оборона плацдарма»: a battlefield unit standing on one of its own spawn
 * cells soaks part of every incoming strike (from units and the headquarters).
 */
function getSpawnDamageReduction(unit: BoardUnit): number {
  if (!isBattlefieldUnit(unit)) return 0;

  const reduction = getCard(unit.cardId).combatAbilities?.spawnDamageReduction ?? 0;
  if (reduction <= 0) return 0;

  return isSpawnCell(unit.ownerId, unit.position) ? reduction : 0;
}

/**
 * «Спецброня»: a unit takes less damage from attackers of a specific class.
 * The headquarters has no class, so its fire is never reduced by this.
 */
function getArmorVsClassReduction(
  unit: BoardUnit,
  attackerClass: TankClass | null
): number {
  if (!attackerClass) return 0;

  const armor = getCard(unit.cardId).combatAbilities?.armorVsClass;
  if (!armor) return 0;

  return armor.class === attackerClass ? armor.amount : 0;
}

/**
 * «Лобовая броня»: a unit soaks part of a strike that comes from the single
 * cell directly in front of it — the direction of the enemy headquarters. The
 * player sits on the left (low columns) facing the bot's HQ on the right, so a
 * player unit's front is toward higher columns and a bot unit's front toward
 * lower columns. Only a straight-ahead strike (same row, in the front column
 * direction) is soaked: diagonal-front, flank and rear strikes deal full
 * damage. It does not help against САУ (spg) fire or headquarters («штаб»)
 * strikes, which arc over the frontal plate.
 */
function getFrontalArmorReduction(
  defender: BoardUnit,
  attacker: NonNullable<ReturnType<typeof getAttacker>>
): number {
  if (!isBattlefieldUnit(defender)) return 0;

  const amount = getCard(defender.cardId).combatAbilities?.frontalArmor?.amount ?? 0;
  if (amount <= 0) return 0;

  // Frontal armor only soaks direct ground fire from the front. Headquarters
  // («штаб») fire and САУ (spg) strikes arc over the plate and ignore it.
  if (!("cardId" in attacker)) return 0;
  if (getCard(attacker.cardId).class === "spg") return 0;

  // Only the single cell directly ahead protects — a diagonally-front attacker
  // (different row) hits the side and bypasses the plate.
  if (attacker.position.row !== defender.position.row) return 0;

  const frontDirection = defender.ownerId === "player" ? 1 : -1;
  const attackDirection = Math.sign(attacker.position.col - defender.position.col);

  return attackDirection === frontDirection ? amount : 0;
}

export function getHeadquartersAttackValue(
  state: BattleState,
  ownerId: PlayerId
): number {
  const supportBonus = getSupportUnits(state, ownerId).reduce(
    (total, unit) =>
      total + (getCard(unit.cardId).supportEffects?.hqAttackBonus ?? 0),
    0
  );
  const abilityBonus = getAbility(state, ownerId)?.hqAttackBonus ?? 0;

  return state.headquarters[ownerId].attack + supportBonus + abilityBonus;
}

/**
 * Tank ambush: own tanks that have not moved this turn strike harder. For the
 * defender the flag reflects its owner's previous turn, which matches the
 * "dug-in tank" flavor of the ability.
 */
function getStationaryTankAttackBonus(
  state: BattleState,
  unit: BoardUnit
): number {
  const ability = getAbility(state, unit.ownerId);

  if (!ability?.stationaryTankAttackBonus) return 0;
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;
  if (unit.moveCountThisTurn > 0) return 0;

  return ability.stationaryTankAttackBonus;
}

/**
 * Dug-in toughness: own tanks that have not moved this turn reduce each
 * incoming strike (the "+HP in ambush" of the tank-brigade ability).
 */
function getStationaryTankDefenseBonus(
  state: BattleState,
  unit: BoardUnit
): number {
  const ability = getAbility(state, unit.ownerId);

  if (!ability?.stationaryTankHpBonus) return 0;
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;
  if (unit.moveCountThisTurn > 0) return 0;

  return ability.stationaryTankHpBonus;
}

/**
 * Armored momentum: own tanks that HAVE moved this turn strike harder — the
 * aggressive mirror of the dug-in ambush bonus. Only rewards a unit attacking
 * on its own turn (a defender's move counter is reset before it counterattacks).
 */
function getMovedTankAttackBonus(state: BattleState, unit: BoardUnit): number {
  const ability = getAbility(state, unit.ownerId);

  if (!ability?.movedTankAttackBonus) return 0;
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;
  if (unit.moveCountThisTurn === 0) return 0;

  return ability.movedTankAttackBonus;
}

/**
 * Command-tank defense aura: while a friendly unit with `tankDefenseAura` is
 * alive on the battlefield, every friendly battlefield tank soaks part of each
 * incoming strike. The strongest aura on the field applies (it does not stack).
 */
function getTankDefenseAuraBonus(state: BattleState, unit: BoardUnit): number {
  if (!isBattlefieldUnit(unit)) return 0;
  if (!isTankClassCard(getCard(unit.cardId))) return 0;

  let bestAura = 0;
  for (const ally of state.units) {
    if (ally.ownerId !== unit.ownerId) continue;
    if (ally.currentHp <= 0) continue;
    if (!isBattlefieldUnit(ally)) continue;

    const aura = getCard(ally.cardId).combatAbilities?.tankDefenseAura ?? 0;
    if (aura > bestAura) bestAura = aura;
  }

  return bestAura;
}

function getUnitCombatBonuses(
  state: BattleState,
  attacker: BoardUnit,
  target: BoardUnit
): Required<UnitCombatBonuses> {
  const attackerClass = getCard(attacker.cardId).class;
  const targetClass = getCard(target.cardId).class;

  return {
    // Effective base firepower (Корректировщик / Огневая позиция).
    attackerAttack: getUnitAttackValue(state, attacker),
    targetAttack: getUnitAttackValue(state, target),
    attackerAttackBonus:
      getStationaryTankAttackBonus(state, attacker) +
      getMovedTankAttackBonus(state, attacker),
    targetAttackBonus:
      getStationaryTankAttackBonus(state, target) +
      getMovedTankAttackBonus(state, target),
    attackerDefenseBonus:
      getStationaryTankDefenseBonus(state, attacker) +
      getTankDefenseAuraBonus(state, attacker) +
      getSpawnDamageReduction(attacker) +
      getArmorVsClassReduction(attacker, targetClass) +
      getFrontalArmorReduction(attacker, target),
    targetDefenseBonus:
      getStationaryTankDefenseBonus(state, target) +
      getTankDefenseAuraBonus(state, target) +
      getSpawnDamageReduction(target) +
      getArmorVsClassReduction(target, attackerClass) +
      getFrontalArmorReduction(target, attacker),
  };
}

/** Extra headquarters damage against an already damaged enemy unit. */
function getHeadquartersBonusVsDamagedUnit(
  state: BattleState,
  attackerOwnerId: PlayerId,
  target: BoardUnit
): number {
  const ability = getAbility(state, attackerOwnerId);

  if (!ability?.hqAttackBonusVsDamaged) return 0;
  if (target.currentHp >= getCard(target.cardId).hp) return 0;

  return ability.hqAttackBonusVsDamaged;
}

function headquartersAttackIgnoresCover(
  state: BattleState,
  attackerOwnerId: PlayerId
): boolean {
  return getAbility(state, attackerOwnerId)?.hqAttackIgnoresCover === true;
}

function canUnitAttackTarget(
  attackerCard: TankCard,
  attackerPosition: Position,
  targetPosition: Position
): boolean {
  if (attackerCard.class === "td") {
    return isAdjacentAnyDirection(attackerPosition, targetPosition);
  }

  if (attackerCard.class === "spg") {
    return true;
  }

  return chebyshevDistance(attackerPosition, targetPosition) <= attackerCard.range;
}

function canAttackTarget(
  state: BattleState,
  attacker: ReturnType<typeof getAttacker>,
  target: ReturnType<typeof getTarget>
): boolean {
  if (!attacker || !target) return false;
  if ("cardId" in attacker && isSupportUnit(attacker)) return false;

  // «Контрбатарейный огонь»: suppressed headquarters / SPG cannot attack.
  if ("cardId" in attacker) {
    if (getCard(attacker.cardId).class === "spg" && attacker.attackSuppressed) {
      return false;
    }
  } else if (attacker.attackSuppressed) {
    return false;
  }

  if ("cardId" in target && isSupportUnit(target)) {
    if (!("cardId" in attacker)) return true;

    const attackerCard = getCard(attacker.cardId);

    return (
      attackerCard.class === "spg" ||
      attacker.position.col === state.headquarters[target.ownerId].position.col
    );
  }

  // «Маскировка»: only an adjacent enemy unit in melee may target this unit —
  // ranged fire, SPGs and the headquarters cannot. The cover is lost once the
  // unit has attacked (target.revealed).
  if (
    "cardId" in target &&
    isBattlefieldUnit(target) &&
    getCard(target.cardId).combatAbilities?.camouflage &&
    !target.revealed
  ) {
    if (!("cardId" in attacker)) return false;
    if (getCard(attacker.cardId).class === "spg") return false;
    if (!isAdjacentAnyDirection(attacker.position, target.position)) return false;
  }

  if (!("cardId" in attacker)) {
    return manhattanDistance(attacker.position, target.position) <= attacker.range;
  }

  const attackerCard = getCard(attacker.cardId);

  return canUnitAttackTarget(attackerCard, attacker.position, target.position);
}

export type AttackAnimationStrike = {
  sourceId: string;
  targetId: string;
  damage: number;
};

export type UnitCombatPreview = {
  strikes: AttackAnimationStrike[];
  attackerHpAfter: number;
  targetHpAfter: number;
  tdAmbushTriggered: boolean;
};

function getCombatObjectId(
  object: NonNullable<ReturnType<typeof getAttacker>>
): string {
  return "cardId" in object ? object.instanceId : `${object.ownerId}_hq`;
}

export type UnitCombatBonuses = {
  /** Effective base firepower of the attacker (defaults to its printed attack). */
  attackerAttack?: number;
  /** Effective base firepower of the target (defaults to its printed attack). */
  targetAttack?: number;
  /** Extra damage added to the attacker's strike. */
  attackerAttackBonus?: number;
  /** Extra damage added to the target's counterattack. */
  targetAttackBonus?: number;
  /** Damage subtracted from each strike that hits the attacker (dug-in tank). */
  attackerDefenseBonus?: number;
  /** Damage subtracted from each strike that hits the target (dug-in tank). */
  targetDefenseBonus?: number;
};

export function getUnitCombatPreview(
  attacker: BoardUnit,
  target: BoardUnit,
  bonuses: UnitCombatBonuses = {}
): UnitCombatPreview {
  const attackerCard = getCard(attacker.cardId);
  const targetCard = getCard(target.cardId);
  const strikes: AttackAnimationStrike[] = [];
  // Dug-in tanks soak part of each incoming strike (stationaryTankHpBonus).
  const attackerDamage = Math.max(
    0,
    (bonuses.attackerAttack ?? attackerCard.attack) +
      (bonuses.attackerAttackBonus ?? 0) -
      (bonuses.targetDefenseBonus ?? 0)
  );
  const targetDamage = Math.max(
    0,
    (bonuses.targetAttack ?? targetCard.attack) +
      (bonuses.targetAttackBonus ?? 0) -
      (bonuses.attackerDefenseBonus ?? 0)
  );
  let attackerHpAfter = attacker.currentHp;
  let targetHpAfter = target.currentHp;
  let tdAmbushTriggered = false;

  const attackTarget = () => {
    targetHpAfter -= attackerDamage;
    strikes.push({
      sourceId: attacker.instanceId,
      targetId: target.instanceId,
      damage: attackerDamage,
    });
  };

  const counterAttack = () => {
    attackerHpAfter -= targetDamage;
    strikes.push({
      sourceId: target.instanceId,
      targetId: attacker.instanceId,
      damage: targetDamage,
    });
  };

  const attackerUsesRangedAttack =
    attackerCard.class === "spg" ||
    chebyshevDistance(attacker.position, target.position) > 1;
  const targetCanUseTdAmbush =
    isBattlefieldUnit(target) &&
    targetCard.class === "td" &&
    attackerCard.class !== "td" &&
    !target.tdAmbushUsedThisTurn &&
    !attackerUsesRangedAttack;

  if (targetCanUseTdAmbush) {
    tdAmbushTriggered = true;
    counterAttack();

    if (attackerHpAfter > 0) {
      attackTarget();
    }

    return {
      strikes,
      attackerHpAfter,
      targetHpAfter,
      tdAmbushTriggered,
    };
  }

  attackTarget();

  const targetCanCounterAttack =
    isBattlefieldUnit(target) &&
    targetCard.class !== "spg" &&
    attackerCard.class !== "spg" &&
    !(
      attackerCard.class === "td" &&
      targetCard.class !== "td" &&
      targetHpAfter <= 0
    );

  if (targetCanCounterAttack) {
    counterAttack();
  }

  return {
    strikes,
    attackerHpAfter,
    targetHpAfter,
    tdAmbushTriggered,
  };
}

type HeadquartersDamageDistribution = {
  redirected: { unit: BoardUnit; damage: number }[];
  headquartersDamage: number;
};

function getHeadquartersDamageDistribution(
  state: BattleState,
  targetOwnerId: PlayerId,
  incomingDamage: number
): HeadquartersDamageDistribution {
  let remainingDamage = incomingDamage;
  const redirected: HeadquartersDamageDistribution["redirected"] = [];

  for (const unit of getSupportUnits(state, targetOwnerId)) {
    const redirectLimit = getCard(unit.cardId).supportEffects?.hqDamageRedirect ?? 0;
    const damage = Math.min(remainingDamage, redirectLimit, unit.currentHp);

    if (damage <= 0) continue;

    redirected.push({ unit, damage });
    remainingDamage -= damage;

    if (remainingDamage <= 0) break;
  }

  return {
    redirected,
    headquartersDamage: remainingDamage,
  };
}

export function getAttackAnimationSequence(
  state: BattleState,
  action: AttackAction
): AttackAnimationStrike[] {
  if (state.status !== "active") return [];
  if (state.activePlayer !== action.playerId) return [];

  const attacker = getAttacker(state, action);
  const target = getTarget(state, action);

  if (!attacker || !target) return [];
  if (attacker.ownerId !== action.playerId) return [];
  if (target.ownerId === action.playerId) return [];
  if (attacker.alreadyAttacked) return [];
  if (!canAttackTarget(state, attacker, target)) return [];

  // Anti-tank screen on the support line (mirrors attack()).
  let effectiveTarget = target;
  const coverStrikes: AttackAnimationStrike[] = [];

  if ("cardId" in target && isSupportUnit(target)) {
    const coverUnit = getSupportCoverUnit(state, target.ownerId);
    const rangedAttack =
      !("cardId" in attacker) || getCard(attacker.cardId).class === "spg";

    if (
      coverUnit &&
      rangedAttack &&
      coverUnit.instanceId !== target.instanceId
    ) {
      effectiveTarget = coverUnit;
    } else if (
      coverUnit &&
      !rangedAttack &&
      "cardId" in attacker &&
      !coverUnit.coverFiredThisTurn
    ) {
      const coverDamage =
        getCard(coverUnit.cardId).supportEffects?.supportLineCover ?? 0;

      coverStrikes.push({
        sourceId: coverUnit.instanceId,
        targetId: attacker.instanceId,
        damage: coverDamage,
      });

      if (attacker.currentHp - coverDamage <= 0) {
        return coverStrikes;
      }
    }
  }

  // Light-tank screen redirect (animation mirror; flags are set in attack()).
  if ("cardId" in effectiveTarget && isBattlefieldUnit(effectiveTarget)) {
    const screen = findLightScreenUnit(state, effectiveTarget);

    if (screen) {
      effectiveTarget = screen;
    }
  }

  if ("cardId" in attacker && "cardId" in effectiveTarget) {
    return [
      ...coverStrikes,
      ...getUnitCombatPreview(
        attacker,
        effectiveTarget,
        getUnitCombatBonuses(state, attacker, effectiveTarget)
      ).strikes,
    ];
  }

  const sourceId = getCombatObjectId(attacker);
  const attackValue = getAttackValue(state, attacker);
  const attackerIsHeadquarters = !("cardId" in attacker);

  if (!("cardId" in target)) {
    const distribution =
      attackerIsHeadquarters &&
      headquartersAttackIgnoresCover(state, attacker.ownerId)
        ? { redirected: [], headquartersDamage: attackValue }
        : getHeadquartersDamageDistribution(state, target.ownerId, attackValue);

    return [
      ...distribution.redirected.map(({ unit, damage }) => ({
        sourceId,
        targetId: unit.instanceId,
        damage,
      })),
      ...(distribution.headquartersDamage > 0
        ? [
            {
              sourceId,
              targetId: getCombatObjectId(target),
              damage: distribution.headquartersDamage,
            },
          ]
        : []),
    ];
  }

  const unitTarget = "cardId" in effectiveTarget ? effectiveTarget : target;
  const spawnReduction =
    "cardId" in unitTarget ? getSpawnDamageReduction(unitTarget) : 0;
  const frontalReduction =
    "cardId" in unitTarget
      ? getFrontalArmorReduction(unitTarget, attacker)
      : 0;

  return [
    {
      sourceId,
      targetId: getCombatObjectId(unitTarget),
      damage: Math.max(
        0,
        attackValue +
          (attackerIsHeadquarters
            ? getHeadquartersBonusVsDamagedUnit(
                state,
                attacker.ownerId,
                unitTarget
              )
            : 0) -
          spawnReduction -
          frontalReduction
      ),
    },
  ];
}

function destroyUnit(
  state: BattleState,
  unit: BoardUnit,
  reason: string,
  destroyedBy?: PlayerId
) {
  const card = getCard(unit.cardId);

  if (destroyedBy) {
    recordDestroyedUnit(state, destroyedBy, unit);
  }

  state.units = state.units.filter(
    (item) => item.instanceId !== unit.instanceId
  );

  addLog(state, `${card.name} ${reason}`);

  // Recovery and repair: once per battle the first destroyed own unit is
  // returned to its owner's hand instead of the discard pile.
  const ability = getAbility(state, unit.ownerId);
  const tracking = getAbilityTracking(state, unit.ownerId);

  if (
    ability?.returnFirstDestroyedUnit &&
    !tracking.destroyedUnitReturnedThisBattle
  ) {
    tracking.destroyedUnitReturnedThisBattle = true;

    state[unit.ownerId].hand.push({
      instanceId: unit.instanceId,
      cardId: unit.cardId,
    });

    addLog(state, `${ability.name}: ${card.name} возвращается в руку.`);
    return;
  }

  state[unit.ownerId].discard.push({
    instanceId: unit.instanceId,
    cardId: unit.cardId,
  });
}

/**
 * «Дозор»: when a battlefield unit actually takes damage, its owner draws a
 * card (at most once per turn). May end the battle if the deck is empty.
 */
function handleDrawWhenAttacked(
  state: BattleState,
  unit: BoardUnit,
  damageTaken: number
) {
  if (damageTaken <= 0) return;
  if (!isBattlefieldUnit(unit)) return;

  const draw = getCard(unit.cardId).combatAbilities?.drawWhenAttacked ?? 0;
  if (draw <= 0 || unit.drawWhenAttackedUsedThisTurn) return;

  unit.drawWhenAttackedUsedThisTurn = true;

  const drawn = drawCardsWithEmptyDeckPenalty(state, unit.ownerId, draw);

  if (drawn > 0) {
    addLog(
      state,
      `${getCard(unit.cardId).name}: дозор — ${
        unit.ownerId === "player" ? "игрок" : "бот"
      } добирает карту.`
    );
  }
}

function attack(state: BattleState, action: AttackAction) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;

  const attacker = getAttacker(state, action);
  let target = getTarget(state, action);

  if (!attacker || !target) return;
  if (attacker.ownerId !== action.playerId) return;
  if (target.ownerId === action.playerId) return;
  if (attacker.alreadyAttacked) return;
  if (!canAttackTarget(state, attacker, target)) return;

  const attackValue = getAttackValue(state, attacker);

  const attackerIsUnit = "cardId" in attacker;

  // Anti-tank screen on the support line.
  if ("cardId" in target && isSupportUnit(target)) {
    const coverUnit = getSupportCoverUnit(state, target.ownerId);
    const rangedAttack =
      !attackerIsUnit ||
      (attackerIsUnit && getCard(attacker.cardId).class === "spg");

    if (coverUnit && rangedAttack && coverUnit.instanceId !== target.instanceId) {
      // Ranged fire against the support line hits the screen first.
      addLog(
        state,
        `${getCard(coverUnit.cardId).name} принимает дистанционный удар на себя.`
      );
      target = coverUnit;
    } else if (
      coverUnit &&
      !rangedAttack &&
      attackerIsUnit &&
      !coverUnit.coverFiredThisTurn
    ) {
      // Melee raid on the support line is met with preemptive return fire.
      const coverDamage =
        getCard(coverUnit.cardId).supportEffects?.supportLineCover ?? 0;

      coverUnit.coverFiredThisTurn = true;
      attacker.currentHp -= coverDamage;

      addLog(
        state,
        `Противотанковый заслон: ${getCard(coverUnit.cardId).name} встречает ${
          getCard(attacker.cardId).name
        } огнём (${coverDamage} урона).`
      );

      if (attacker.currentHp <= 0) {
        destroyUnit(
          state,
          attacker,
          "уничтожен заслоном на подступах к тылу.",
          target.ownerId
        );
        markSuccessfulAction(state, action.playerId);
        return;
      }
    }
  }

  // Light-tank screen: once per turn the first strike aimed at a friendly
  // light tank is redirected into the screening unit (e.g. Porsche-823).
  if ("cardId" in target && isBattlefieldUnit(target)) {
    const screen = findLightScreenUnit(state, target);

    if (screen) {
      screen.coverFiredThisTurn = true;

      addLog(
        state,
        `${getCard(screen.cardId).name} принимает удар по ${
          getCard(target.cardId).name
        } на себя.`
      );

      target = screen;
    }
  }

  const targetIsUnit = "cardId" in target;
  const targetUnit = targetIsUnit ? (target as BoardUnit) : null;
  const targetHeadquarters = targetIsUnit ? null : (target as HeadquartersState);

  const attackerCard = attackerIsUnit ? getCard(attacker.cardId) : null;
  const targetCard = targetUnit ? getCard(targetUnit.cardId) : null;

  const attackerName = attackerCard ? attackerCard.name : "Штаб";
  const targetName = targetCard ? targetCard.name : "штаб";

  if (targetIsUnit) {
    if (!targetUnit) return;

    const targetHpBefore = targetUnit.currentHp;

    if (attackerIsUnit && attackerCard && targetCard) {
      const combatBonuses = getUnitCombatBonuses(state, attacker, targetUnit);
      const preview = getUnitCombatPreview(attacker, targetUnit, combatBonuses);

      if (combatBonuses.attackerAttackBonus > 0) {
        addLog(
          state,
          `${getAbility(state, attacker.ownerId)?.name}: ${attackerCard.name} наносит усиленный удар (+${combatBonuses.attackerAttackBonus} к атаке).`
        );
      }

      attacker.currentHp = preview.attackerHpAfter;
      targetUnit.currentHp = preview.targetHpAfter;
      targetUnit.tdAmbushUsedThisTurn =
        targetUnit.tdAmbushUsedThisTurn || preview.tdAmbushTriggered;

      for (const [index, strike] of preview.strikes.entries()) {
        const isAttackerStrike = strike.sourceId === attacker.instanceId;
        const isPreemptiveTdStrike =
          index === 0 && !isAttackerStrike && preview.tdAmbushTriggered;

        if (isPreemptiveTdStrike) {
          addLog(
            state,
            `${targetName} открывает упреждающий огонь и наносит ${strike.damage} урона.`
          );
          continue;
        }

        if (!isAttackerStrike) {
          addLog(
            state,
            `${targetName} отвечает огнем и наносит ${strike.damage} урона.`
          );
          continue;
        }

        addLog(
          state,
          `${attackerName} атакует ${targetName} и наносит ${strike.damage} урона.`
        );
      }
    } else {
      const damagedBonus = getHeadquartersBonusVsDamagedUnit(
        state,
        action.playerId,
        targetUnit
      );
      // «Оборона плацдарма» softens headquarters fire (spawn-zone protection).
      // «Лобовая броня» does NOT — HQ shells arc over the frontal plate.
      const spawnReduction = getSpawnDamageReduction(targetUnit);
      const frontalReduction = getFrontalArmorReduction(targetUnit, attacker);
      const totalDamage = Math.max(
        0,
        attackValue + damagedBonus - spawnReduction - frontalReduction
      );

      targetUnit.currentHp -= totalDamage;

      if (damagedBonus > 0) {
        addLog(
          state,
          `${getAbility(state, action.playerId)?.name}: +${damagedBonus} урона по повреждённой технике.`
        );
      }

      addLog(
        state,
        `${attackerName} атакует ${targetName} и наносит ${totalDamage} урона.`
      );
    }

    // «Дозор»: the defender draws a card when it actually took damage.
    handleDrawWhenAttacked(
      state,
      targetUnit,
      targetHpBefore - targetUnit.currentHp
    );

    if (targetUnit.currentHp <= 0) {
      destroyUnit(state, targetUnit, "уничтожен.", action.playerId);
    }

    if (attackerIsUnit && attacker.currentHp <= 0) {
      destroyUnit(
        state,
        attacker,
        "уничтожен ответным огнем.",
        getOpponent(action.playerId)
      );
    }
  } else {
    if (!targetHeadquarters) return;

    const normalDistribution = getHeadquartersDamageDistribution(
      state,
      targetHeadquarters.ownerId,
      attackValue
    );
    const ignoresCover =
      !attackerIsUnit &&
      headquartersAttackIgnoresCover(state, action.playerId) &&
      normalDistribution.redirected.length > 0;
    const distribution: HeadquartersDamageDistribution = ignoresCover
      ? { redirected: [], headquartersDamage: attackValue }
      : normalDistribution;

    if (ignoresCover) {
      addLog(
        state,
        `${getAbility(state, action.playerId)?.name}: удар штаба нельзя перехватить.`
      );
    }

    for (const { unit, damage } of distribution.redirected) {
      unit.currentHp -= damage;

      if (unit.currentHp <= 0) {
        destroyUnit(state, unit, "destroyed while covering headquarters.", action.playerId);
      }
    }

    const incoming = distribution.headquartersDamage;
    targetHeadquarters.hp -= incoming;
    addLog(state, `${attackerName} атакует штаб и наносит ${incoming} урона.`);

    if (targetHeadquarters.hp <= 0) {
      state.status = targetHeadquarters.ownerId === "player" ? "bot_won" : "player_won";

      addLog(
        state,
        targetHeadquarters.ownerId === "player" ? "Бот победил." : "Игрок победил."
      );
    }
  }

  attacker.alreadyAttacked = true;

  // «Маскировка» drops permanently once the unit opens fire.
  if (attackerIsUnit && attackerCard?.combatAbilities?.camouflage) {
    attacker.revealed = true;
  }

  // Heavy tanks either move or attack in a turn, never both.
  if (attackerIsUnit && attackerCard?.class === "heavy") {
    attacker.alreadyMoved = true;
  }

  if (state.status === "active") {
    markSuccessfulAction(state, action.playerId);
  }
}

function getLightTankMoveCost(
  from: Position,
  to: Position,
  isSpawnBonusMove: boolean
): number | null {
  const straight = isStraightMove(from, to);
  const diagonal = isDiagonalMove(from, to);
  const manhattan = manhattanDistance(from, to);

  if (isSpawnBonusMove) {
    return straight && manhattan === 1 ? 1 : null;
  }

  if (diagonal) {
    return 2;
  }

  if (straight && manhattan === 1) {
    return 1;
  }

  if (straight && manhattan === 2) {
    return 2;
  }

  return null;
}

function canUnitMoveTo(
  card: TankCard,
  from: Position,
  to: Position,
  isSpawnBonusMove: boolean,
  moveCountThisTurn = 0
): boolean {
  if (samePosition(from, to)) return false;

  const straight = isStraightMove(from, to);
  const manhattan = manhattanDistance(from, to);

  if (card.class === "light") {
    const moveCost = getLightTankMoveCost(from, to, isSpawnBonusMove);

    if (moveCost === null) return false;

    if (isSpawnBonusMove) {
      // Spawn bonus is only 1 cell straight
      return straight && manhattan === 1;
    }

    return moveCountThisTurn + moveCost <= 2;
  }

  if (card.class === "medium") {
    return isAdjacentAnyDirection(from, to);
  }

  return straight && manhattan === 1;
}

/**
 * «Огневая позиция»: keep an SPG's maximum-HP bonus in sync with whether it is
 * standing on a board corner. Entering a corner grants the bonus HP; leaving
 * removes it (never reducing current HP below 1).
 */
function applyCornerHpBonus(unit: BoardUnit) {
  const card = getCard(unit.cardId);
  const desired =
    card.class === "spg" &&
    isBattlefieldUnit(unit) &&
    isCornerCell(unit.position)
      ? card.combatAbilities?.cornerBonus?.hp ?? 0
      : 0;
  const applied = unit.cornerHpApplied ?? 0;

  if (desired === applied) return;

  const delta = desired - applied;
  unit.currentHp =
    delta > 0 ? unit.currentHp + delta : Math.max(1, unit.currentHp + delta);
  unit.cornerHpApplied = desired;
}

function moveUnit(
  state: BattleState,
  action: Extract<BattleAction, { type: "MOVE_UNIT" }>
) {
  if (state.status !== "active") return;
  if (state.activePlayer !== action.playerId) return;

  const unit = state.units.find((item) => item.instanceId === action.unitId);

  if (!unit) return;
  if (unit.ownerId !== action.playerId) return;
  if (isSupportUnit(unit)) return;
  if (unit.alreadyMoved) return;
  if (isCellOccupied(state, action.position)) return;

  const card = getCard(unit.cardId);
  const fromPosition = unit.position;
  const isLightTank = card.class === "light";
  const moveCountThisTurn = unit.moveCountThisTurn ?? 0;
  const isSpawnBonusMove = isLightTank && unit.spawnedThisTurn;

  if (
    !canUnitMoveTo(
      card,
      fromPosition,
      action.position,
      isSpawnBonusMove,
      moveCountThisTurn
    )
  ) {
    return;
  }

  // Extra pathing rule for light tanks doing 2-cell straight moves:
  // they cannot jump over any unit (friendly or enemy)
  const lightManhattan = manhattanDistance(fromPosition, action.position);
  if (isLightTank && lightManhattan === 2 && isStraightMove(fromPosition, action.position)) {
    if (!isPathClear(state, fromPosition, action.position)) {
      return;
    }
  }

  unit.position = action.position;

  if (isLightTank) {
    const moveCost =
      getLightTankMoveCost(fromPosition, action.position, isSpawnBonusMove) ?? 1;

    if (isSpawnBonusMove) {
      unit.moveCountThisTurn = 1;
      unit.alreadyMoved = true;
    } else {
      const nextMoveCount = moveCountThisTurn + moveCost;

      unit.moveCountThisTurn = nextMoveCount;
      unit.alreadyMoved = nextMoveCount >= 2;
    }

    unit.spawnedThisTurn = false;
  } else {
    unit.alreadyMoved = true;
    unit.spawnedThisTurn = false;
    unit.moveCountThisTurn = 1;
  }

  // Heavy tanks either move or attack in a turn, never both.
  if (card.class === "heavy") {
    unit.alreadyAttacked = true;
  }

  // ПТ-САУ may fire and then reposition, but moving first forfeits the shot:
  // a tank destroyer that has moved can no longer attack this turn.
  if (card.class === "td") {
    unit.alreadyAttacked = true;
  }

  // «Маскировка» drops permanently once the unit breaks cover by moving.
  if (card.combatAbilities?.camouflage && !unit.revealed) {
    unit.revealed = true;
    addLog(state, `${card.name}: маскировка раскрыта при движении.`);
  }

  // «Огневая позиция»: refresh the corner HP bonus for SPGs.
  applyCornerHpBonus(unit);

  // «Прорыв»: drawing the first time this unit reaches an enemy spawn cell.
  const raidDraw = card.combatAbilities?.raidDraw ?? 0;

  if (
    raidDraw > 0 &&
    !unit.raidDrawUsed &&
    isSpawnCell(getOpponent(unit.ownerId), unit.position)
  ) {
    unit.raidDrawUsed = true;

    const drawn = drawCardsWithEmptyDeckPenalty(state, unit.ownerId, raidDraw);

    if (drawn > 0) {
      addLog(
        state,
        `${card.name}: прорыв на плацдарм — ${
          unit.ownerId === "player" ? "игрок" : "бот"
        } добирает карту.`
      );
    }

    if (state.status !== "active") return;
  }

  markSuccessfulAction(state, action.playerId);

  addLog(
    state,
    `${action.playerId === "player" ? "Игрок" : "Бот"} перемещает ${
      card.name
    } на [${action.position.row},${
      action.position.col
    }].`
  );
}

function endTurn(state: BattleState, playerId: PlayerId) {
  if (state.status !== "active") return;
  if (state.activePlayer !== playerId) return;

  state.timers[playerId].actedThisStep = true;
  state.timers[playerId].stepTimeLeftMs = STEP_TIME_MS;

  // «Контрбатарейный огонь» wears off at the end of the suppressed side's turn.
  state.headquarters[playerId].attackSuppressed = false;
  for (const unit of state.units) {
    if (unit.ownerId === playerId) unit.attackSuppressed = false;
  }

  const nextPlayer = getOpponent(playerId);

  state.activePlayer = nextPlayer;

  if (nextPlayer === "player") {
    state.turn += 1;
  }

  startTurn(state, nextPlayer);

  if (state.status !== "active") {
    return;
  }

  addLog(
    state,
    `Ход переходит к ${nextPlayer === "player" ? "игроку" : "боту"}.`
  );
}

function handleIdleTimeout(state: BattleState, playerId: PlayerId) {
  if (state.status !== "active") return;
  if (state.activePlayer !== playerId) return;

  const timer = state.timers[playerId];

  timer.idleStreak += 1;
  timer.stepTimeLeftMs = STEP_TIME_MS;
  timer.actedThisStep = false;

  if (timer.idleStreak >= 3) {
    setWinnerByLoser(
      state,
      playerId,
      `${getPlayerLabel(playerId).toLowerCase()} пропустил действие 3 раза подряд`
    );

    return;
  }

  if (timer.idleStreak === 2) {
    const headquarters = state.headquarters[playerId];

    headquarters.hp -= 1;

    addLog(
      state,
      `${
        playerId === "player" ? "Игрок" : "Бот"
      } бездействует второй раз подряд. Штаб теряет 1 HP.`
    );

    if (headquarters.hp <= 0) {
      state.status = playerId === "player" ? "bot_won" : "player_won";

      addLog(
        state,
        playerId === "player"
          ? "Штаб игрока уничтожен. Бот победил."
          : "Штаб бота уничтожен. Игрок победил."
      );

      return;
    }
  } else {
    addLog(
      state,
      `${
        playerId === "player" ? "Игрок" : "Бот"
      } не сделал действие за минуту. Ход пропущен.`
    );
  }

  endTurn(state, playerId);
}

function timerTick(
  state: BattleState,
  action: Extract<BattleAction, { type: "TIMER_TICK" }>
) {
  if (state.status !== "active") return;

  if (!state.timers?.player || !state.timers?.bot) {
    return;
  }

  const activePlayer = state.activePlayer;
  const timer = state.timers[activePlayer];

  if (!timer) {
    return;
  }

  timer.stepTimeLeftMs = Math.max(0, timer.stepTimeLeftMs - action.elapsedMs);

  if (timer.stepTimeLeftMs <= 0) {
    handleIdleTimeout(state, activePlayer);
  }
}

export function applyAction(
  state: BattleState,
  action: BattleAction
): BattleState {
  const nextState = cloneState(state);

    switch (action.type) {
    case "BEGIN_BATTLE":
      beginBattle(nextState, action);
      break;

    case "PLAY_CARD":
      playCard(nextState, action);
      break;

    case "PLAY_SUPPORT_CARD":
      playSupportCard(nextState, action);
      break;

    case "MOVE_UNIT":
      moveUnit(nextState, action);
      break;

    case "ATTACK":
      attack(nextState, action);
      break;

    case "END_TURN":
      markSuccessfulAction(nextState, action.playerId);
      endTurn(nextState, action.playerId);
      break;

    case "TIMER_TICK":
      timerTick(nextState, action);
      break;

    default:
      return nextState;
  }

  return nextState;
}

export function getFreeSpawnCells(
  state: BattleState,
  playerId: PlayerId
): Position[] {
  const spawnCells =
    playerId === "player" ? PLAYER_SPAWN_CELLS : BOT_SPAWN_CELLS;

  return spawnCells.filter((cell) => !isCellOccupied(state, cell));
}

export function getFreeSupportSlots(
  state: BattleState,
  playerId: PlayerId
): SupportSlot[] {
  return SUPPORT_SLOTS.filter(
    (supportSlot) => !isSupportSlotOccupied(state, playerId, supportSlot)
  );
}

export function getTargetsInRange(
  state: BattleState,
  playerId: PlayerId,
  attackerType: "unit" | "headquarters",
  attackerId: string
) {
  const fakeAction: AttackAction = {
    type: "ATTACK",
    playerId,
    attackerType,
    attackerId,
    targetType: "headquarters",
    targetId: "",
  };

  const attacker = getAttacker(state, fakeAction);

  if (!attacker || attacker.alreadyAttacked) return [];

  const opponent = getOpponent(playerId);

  const enemyUnits = state.units.filter(
    (unit) => unit.ownerId === opponent && canAttackTarget(state, attacker, unit)
  );

  const enemyHq = state.headquarters[opponent];
  const hqInRange = canAttackTarget(state, attacker, enemyHq);

  return [
    ...enemyUnits.map((unit) => ({
      type: "unit" as const,
      id: unit.instanceId,
    })),
    ...(hqInRange
      ? [
          {
            type: "headquarters" as const,
            id: `${opponent}_hq`,
          },
        ]
      : []),
  ];
}

export function getAvailableMoveCells(
  state: BattleState,
  playerId: PlayerId,
  unitId: string
): Position[] {
  const unit = state.units.find((item) => item.instanceId === unitId);

  if (!unit) return [];
  if (unit.ownerId !== playerId) return [];
  if (isSupportUnit(unit)) return [];
  if (unit.alreadyMoved) return [];

  const card = getCard(unit.cardId);

  const result: Position[] = [];

  const rows = [0, 1, 2] as const;
  const cols = [0, 1, 2, 3, 4] as const;

  const isSpawnBonusMove = card.class === "light" && unit.spawnedThisTurn;
  const moveCountThisTurn = unit.moveCountThisTurn ?? 0;

  for (const row of rows) {
    for (const col of cols) {
      const position: Position = { row, col };

      if (isCellOccupied(state, position)) continue;

      if (
        !canUnitMoveTo(
          card,
          unit.position,
          position,
          isSpawnBonusMove,
          moveCountThisTurn
        )
      ) {
        continue;
      }

      // For light tanks considering 2-cell straight moves, hide the target if intermediate is blocked
      const manh = manhattanDistance(unit.position, position);
      if (card.class === "light" && manh === 2 && isStraightMove(unit.position, position)) {
        if (!isPathClear(state, unit.position, position)) {
          continue;
        }
      }

      result.push(position);
    }
  }

  return result;
}
