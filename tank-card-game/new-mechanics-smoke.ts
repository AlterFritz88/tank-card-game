/* Smoke test for the new card mechanics. Run: npx tsx new-mechanics-smoke.ts */
import { createInitialBattleState } from "./src/game/initialState";
import {
  applyAction,
  getEffectiveCardCost,
  getHeadquartersAttackValue,
  getTargetsInRange,
} from "./src/game/engine";
import { cards, getCard } from "./src/game/cards";
import type {
  BattleState,
  BoardUnit,
  HeadquartersId,
  TankCard,
} from "./src/game/types";

let failures = 0;

function check(name: string, condition: boolean, details = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${details}`);
  }
}

// Register temporary test cards carrying the new mechanics.
const testCardBase: Omit<TankCard, "id" | "name" | "class"> = {
  nation: "ussr",
  rarity: "common",
  cost: 3,
  attack: 3,
  armor: 0,
  hp: 6,
  range: 1,
  movement: 1,
  fuelGeneration: 1,
  initiative: 3,
};

const testCards: TankCard[] = [
  { ...testCardBase, id: "tc_camo", name: "Камуфляж", class: "medium", combatAbilities: { camouflage: true } },
  { ...testCardBase, id: "tc_spotter", name: "Корректировщик", class: "medium", attack: 1, combatAbilities: { attackEqualsHq: true } },
  { ...testCardBase, id: "tc_armor", name: "Спецброня", class: "medium", combatAbilities: { armorVsClass: { class: "light", amount: 2 } } },
  { ...testCardBase, id: "tc_draw", name: "Дозор", class: "medium", combatAbilities: { drawWhenAttacked: 1 } },
  { ...testCardBase, id: "tc_corner", name: "Огневая позиция", class: "spg", attack: 2, combatAbilities: { cornerBonus: { attack: 2, hp: 3 } } },
  { ...testCardBase, id: "tc_spawn", name: "Оборона плацдарма", class: "medium", combatAbilities: { spawnDamageReduction: 2 } },
  { ...testCardBase, id: "tc_raid", name: "Прорыв", class: "light", attack: 1, combatAbilities: { raidDraw: 1 } },
  { ...testCardBase, id: "tc_suppress", name: "Контрбатарея", class: "medium", cost: 3, onPlayEffects: { suppressEnemyIndirect: true } },
  { ...testCardBase, id: "tc_slack", name: "Слаженность", class: "medium", cost: 4, costModifiers: { ifClassPresent: "light", discount: 2 } },
];

cards.push(...testCards);

function makeBattle(deckCard = "t34_76", playerHq: HeadquartersId = "training_unit"): BattleState {
  const state = createInitialBattleState({
    playerHeadquartersId: playerHq,
    playerDeckCardIds: Array.from({ length: 40 }, () => deckCard),
  });

  return applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });
}

function makeUnit(
  partial: Partial<BoardUnit> & { instanceId: string; cardId: string; ownerId: "player" | "bot" }
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

function attackAction(attackerId: string, targetId: string, playerId: "player" | "bot" = "player") {
  return {
    type: "ATTACK" as const,
    playerId,
    attackerType: "unit" as const,
    attackerId,
    targetType: "unit" as const,
    targetId,
  };
}

// 1. Маскировка: нельзя бить штабом / САУ / дистанционно; можно вблизи.
{
  // а) Штаб не может атаковать замаскированную цель.
  const battle = makeBattle();
  battle.units.push(
    makeUnit({ instanceId: "camo", cardId: "tc_camo", ownerId: "bot", position: { row: 1, col: 1 } })
  );
  const hqHit = applyAction(battle, {
    type: "ATTACK",
    playerId: "player",
    attackerType: "headquarters",
    attackerId: "player_hq",
    targetType: "unit",
    targetId: "camo",
  });
  const afterHq = hqHit.units.find((u) => u.instanceId === "camo");
  check("Маскировка: штаб не наносит урон", afterHq?.currentHp === getCard("tc_camo").hp, `hp ${afterHq?.currentHp}`);

  // б) САУ не может атаковать замаскированную цель (даже рядом).
  const spgBattle = makeBattle();
  spgBattle.units.push(
    makeUnit({ instanceId: "spg", cardId: "tc_corner", ownerId: "player", position: { row: 1, col: 0 } }),
    makeUnit({ instanceId: "camo", cardId: "tc_camo", ownerId: "bot", position: { row: 1, col: 1 } })
  );
  const spgHit = applyAction(spgBattle, attackAction("spg", "camo"));
  const afterSpg = spgHit.units.find((u) => u.instanceId === "camo");
  check("Маскировка: САУ не наносит урон", afterSpg?.currentHp === getCard("tc_camo").hp, `hp ${afterSpg?.currentHp}`);

  // в) Соседний обычный танк бьёт нормально.
  const meleeBattle = makeBattle();
  meleeBattle.units.push(
    makeUnit({ instanceId: "atk", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 0 } }),
    makeUnit({ instanceId: "camo", cardId: "tc_camo", ownerId: "bot", position: { row: 1, col: 1 } })
  );
  const meleeHit = applyAction(meleeBattle, attackAction("atk", "camo"));
  const afterMelee = meleeHit.units.find((u) => u.instanceId === "camo");
  check(
    "Маскировка: соседний танк наносит урон",
    afterMelee?.currentHp === getCard("tc_camo").hp - getCard("t34_76").attack,
    `hp ${afterMelee?.currentHp}`
  );
}

// 2. Корректировщик: огневая мощь равна огневой мощи штаба.
{
  const battle = makeBattle("t34_76", "german_artillery_division"); // +1 к атаке штаба
  const hqAttack = getHeadquartersAttackValue(battle, "player");
  battle.units.push(
    makeUnit({ instanceId: "spotter", cardId: "tc_spotter", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "tgt", cardId: "kv1", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const next = applyAction(battle, attackAction("spotter", "tgt"));
  const tgt = next.units.find((u) => u.instanceId === "tgt");
  check(
    "Корректировщик: урон равен атаке штаба",
    tgt?.currentHp === getCard("kv1").hp - hqAttack && hqAttack !== getCard("tc_spotter").attack,
    `hp ${tgt?.currentHp}, hqAttack ${hqAttack}, printed ${getCard("tc_spotter").attack}`
  );
}

// 3. Прорыв: заход на плацдарм врага добирает карту.
{
  const battle = makeBattle();
  const handBefore = battle.player.hand.length;
  battle.units.push(
    makeUnit({ instanceId: "raider", cardId: "tc_raid", ownerId: "player", position: { row: 1, col: 2 } })
  );
  const next = applyAction(battle, {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: "raider",
    position: { row: 1, col: 3 }, // bot spawn cell
  });
  check(
    "Прорыв: добор карты при заходе на вражеский плацдарм",
    next.player.hand.length === handBefore + 1,
    `hand ${next.player.hand.length}, before ${handBefore}`
  );
}

// 4. Спецброня: меньше урона от лёгкого класса.
{
  const battle = makeBattle();
  battle.units.push(
    makeUnit({ instanceId: "light", cardId: "bt_7", ownerId: "player", position: { row: 1, col: 0 } }),
    makeUnit({ instanceId: "armor", cardId: "tc_armor", ownerId: "bot", position: { row: 1, col: 1 } })
  );
  const next = applyAction(battle, attackAction("light", "armor"));
  const armor = next.units.find((u) => u.instanceId === "armor");
  const expected = getCard("tc_armor").hp - Math.max(0, getCard("bt_7").attack - 2);
  check("Спецброня: −2 урона от лёгкого танка", armor?.currentHp === expected, `hp ${armor?.currentHp}, expected ${expected}`);
}

// 5. Слаженность: дешевле при наличии класса на поле.
{
  const battle = makeBattle();
  const full = getEffectiveCardCost(battle, "player", "tc_slack");
  battle.units.push(
    makeUnit({ instanceId: "light", cardId: "bt_7", ownerId: "player", position: { row: 1, col: 1 } })
  );
  const discounted = getEffectiveCardCost(battle, "player", "tc_slack");
  check(
    "Слаженность: 4 без лёгкого, 2 с лёгким на поле",
    full === 4 && discounted === 2,
    `full ${full}, discounted ${discounted}`
  );
}

// 6. Дозор: при получении урона владелец добирает карту (раз за ход).
{
  const battle = makeBattle();
  battle.activePlayer = "bot";
  battle.units.push(
    makeUnit({ instanceId: "watch", cardId: "tc_draw", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "atk", cardId: "panzer_iv", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const handBefore = battle.player.hand.length;
  const next = applyAction(battle, attackAction("atk", "watch", "bot"));
  check(
    "Дозор: владелец добирает карту при получении урона",
    next.player.hand.length === handBefore + 1,
    `hand ${next.player.hand.length}, before ${handBefore}`
  );
}

// 7. Огневая позиция: САУ в углу — +атака и +HP.
{
  // а) HP-бонус при заходе в угол.
  const hpBattle = makeBattle();
  hpBattle.units.push(
    makeUnit({ instanceId: "spg", cardId: "tc_corner", ownerId: "player", position: { row: 1, col: 0 } })
  );
  const moved = applyAction(hpBattle, {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: "spg",
    position: { row: 0, col: 0 }, // corner
  });
  const spgMoved = moved.units.find((u) => u.instanceId === "spg");
  check(
    "Огневая позиция: +3 HP в углу",
    spgMoved?.currentHp === getCard("tc_corner").hp + 3,
    `hp ${spgMoved?.currentHp}`
  );

  // б) Атака-бонус из угла.
  const atkBattle = makeBattle();
  atkBattle.units.push(
    makeUnit({ instanceId: "spg", cardId: "tc_corner", ownerId: "player", position: { row: 0, col: 0 } }),
    makeUnit({ instanceId: "tgt", cardId: "kv1", ownerId: "bot", position: { row: 2, col: 4 } })
  );
  const next = applyAction(atkBattle, attackAction("spg", "tgt"));
  const tgt = next.units.find((u) => u.instanceId === "tgt");
  check(
    "Огневая позиция: +2 к атаке из угла",
    tgt?.currentHp === getCard("kv1").hp - (getCard("tc_corner").attack + 2),
    `hp ${tgt?.currentHp}`
  );
}

// 8. Контрбатарейный огонь: вражеские САУ и штаб не могут атаковать.
{
  let battle = makeBattle();
  battle.player.resources = 10;
  battle.units.push(
    makeUnit({ instanceId: "espg", cardId: "tc_corner", ownerId: "bot", position: { row: 1, col: 3 } }),
    makeUnit({ instanceId: "ptarget", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 2 } })
  );
  const suppressCard = battle.player.hand.find((c) => c.cardId === "tc_suppress");
  // Гарантируем карту в руке.
  const instanceId = suppressCard?.instanceId ?? "supp_inst";
  if (!suppressCard) battle.player.hand.push({ instanceId, cardId: "tc_suppress" });

  battle = applyAction(battle, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: instanceId,
    position: { row: 1, col: 1 },
  });

  const botSpg = battle.units.find((u) => u.instanceId === "espg");
  const spgTargets = getTargetsInRange(battle, "bot", "unit", "espg");
  const hqTargets = getTargetsInRange(battle, "bot", "headquarters", "bot_hq");

  check("Контрбатарея: вражеская САУ подавлена", botSpg?.attackSuppressed === true);
  check("Контрбатарея: вражеский штаб подавлен", battle.headquarters.bot.attackSuppressed === true);
  check("Контрбатарея: САУ не имеет целей", spgTargets.length === 0, `targets ${spgTargets.length}`);
  check("Контрбатарея: штаб не имеет целей", hqTargets.length === 0, `targets ${hqTargets.length}`);

  // Снимается после хода подавлённой стороны.
  battle = applyAction(battle, { type: "END_TURN", playerId: "player" });
  battle = applyAction(battle, { type: "END_TURN", playerId: "bot" });
  check("Контрбатарея: подавление снято после хода бота", battle.headquarters.bot.attackSuppressed === false);
}

// 9. Оборона плацдарма: меньше урона на своём спавне.
{
  // На плацдарме урон снижен.
  const onSpawn = makeBattle();
  onSpawn.units.push(
    makeUnit({ instanceId: "atk", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 2 } }),
    makeUnit({ instanceId: "def", cardId: "tc_spawn", ownerId: "bot", position: { row: 1, col: 3 } }) // bot spawn
  );
  const next1 = applyAction(onSpawn, attackAction("atk", "def"));
  const def1 = next1.units.find((u) => u.instanceId === "def");
  const reduced = getCard("tc_spawn").hp - Math.max(0, getCard("t34_76").attack - 2);
  check("Оборона плацдарма: урон снижен на спавне", def1?.currentHp === reduced, `hp ${def1?.currentHp}, expected ${reduced}`);

  // Вне плацдарма — полный урон.
  const offSpawn = makeBattle();
  offSpawn.units.push(
    makeUnit({ instanceId: "atk", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "def", cardId: "tc_spawn", ownerId: "bot", position: { row: 1, col: 2 } }) // not spawn
  );
  const next2 = applyAction(offSpawn, attackAction("atk", "def"));
  const def2 = next2.units.find((u) => u.instanceId === "def");
  const fullDmg = getCard("tc_spawn").hp - getCard("t34_76").attack;
  check("Контроль: вне плацдарма полный урон", def2?.currentHp === fullDmg, `hp ${def2?.currentHp}, expected ${fullDmg}`);
}

// 10. Маскировка спадает после первой атаки юнита.
{
  const battle = makeBattle();
  battle.units.push(
    makeUnit({ instanceId: "camo", cardId: "tc_camo", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "prey", cardId: "kv1", ownerId: "bot", position: { row: 1, col: 2 } }),
    makeUnit({ instanceId: "espg", cardId: "tc_corner", ownerId: "bot", position: { row: 1, col: 3 } })
  );

  const targetsBefore = getTargetsInRange(battle, "bot", "unit", "espg").map((t) => t.id);
  check("Маскировка: до атаки САУ не видит замаскированного", !targetsBefore.includes("camo"));

  const next = applyAction(battle, attackAction("camo", "prey"));
  const camo = next.units.find((u) => u.instanceId === "camo");
  const targetsAfter = getTargetsInRange(next, "bot", "unit", "espg").map((t) => t.id);

  check("Маскировка: помечен раскрытым после атаки", camo?.revealed === true);
  check("Маскировка: после атаки САУ может бить раскрытого", targetsAfter.includes("camo"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
