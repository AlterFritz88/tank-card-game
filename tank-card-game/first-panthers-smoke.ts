/* Smoke test for the «Первые Пантеры» mechanics.
   Run: npx tsx first-panthers-smoke.ts */
import { createInitialBattleState } from "./src/game/initialState";
import { applyAction } from "./src/game/engine";
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

// Test cards carrying the new mechanics, plus a plain reference attacker.
const base: Omit<TankCard, "id" | "name" | "class"> = {
  nation: "germany",
  rarity: "common",
  cost: 3,
  attack: 3,
  armor: 0,
  hp: 8,
  range: 1,
  movement: 1,
  fuelGeneration: 1,
  initiative: 3,
};

const testCards: TankCard[] = [
  // Attackers: one plain, one with a long gun that ignores 2 armor.
  { ...base, id: "pt_plain", name: "Плоский", class: "medium", attack: 3 },
  { ...base, id: "pt_longgun", name: "Длинный ствол", class: "medium", attack: 3, combatAbilities: { longGun: { armorIgnored: 2 } } },
  // Sloped-armor target (frontal armor 2), like the trophy T-34.
  { ...base, id: "pt_sloped", name: "Наклонная", class: "medium", attack: 0, hp: 10, combatAbilities: { frontalArmor: { amount: 2 } } },
  // Weak-flanks target.
  { ...base, id: "pt_flank", name: "Тонкие борта", class: "medium", attack: 0, hp: 10, combatAbilities: { flankVulnerable: { amount: 2 } } },
  // Overheat: ignites after a single action (threshold 1).
  { ...base, id: "pt_hot", name: "Перегрев", class: "medium", attack: 3, combatAbilities: { overheat: { threshold: 1 } } },
  // Overheat prototype: deployment damage variant that also overheats on the march.
  { ...base, id: "pt_proto", name: "Прототип", class: "medium", attack: 3, combatAbilities: { overheat: { deploymentDamage: { min: 0, max: 3 } } } },
  // Repair vehicle.
  { ...base, id: "pt_berge", name: "Летучка", class: "medium", attack: 1, hp: 6, combatAbilities: { repairAura: { healHp: 1 } } },
  // Plain victim to be shot at.
  { ...base, id: "pt_victim", name: "Мишень", class: "medium", attack: 0, hp: 12 },
];

cards.push(...testCards);

function makeBattle(): BattleState {
  const state = createInitialBattleState({
    playerHeadquartersId: "training_unit" as HeadquartersId,
    botHeadquartersId: "trainingslager" as HeadquartersId,
    playerDeckCardIds: Array.from({ length: 40 }, () => "pt_plain"),
    botDeckCardIds: Array.from({ length: 40 }, () => "pt_plain"),
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

function attack(attackerId: string, targetId: string, playerId: "player" | "bot" = "player") {
  return {
    type: "ATTACK" as const,
    playerId,
    attackerType: "unit" as const,
    attackerId,
    targetType: "unit" as const,
    targetId,
  };
}

/** Advance a full round back to the player's turn start (runs startTurn). */
function roundTrip(state: BattleState): BattleState {
  state = applyAction(state, { type: "END_TURN", playerId: "player" });
  state = applyAction(state, { type: "END_TURN", playerId: "bot" });
  return state;
}

// 1. Длинный ствол гасит наклонную броню; плоская пушка — нет.
{
  const b1 = makeBattle();
  b1.units.push(
    makeUnit({ instanceId: "a", cardId: "pt_plain", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "t", cardId: "pt_sloped", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const after1 = applyAction(b1, attack("a", "t"));
  const t1 = after1.units.find((u) => u.instanceId === "t")!;
  // Frontal hit vs frontalArmor 2: 3 attack − 2 armor = 1 damage.
  check("Длинный ствол: плоская пушка режется наклонной бронёй", t1.currentHp === 10 - 1, `hp ${t1.currentHp}`);

  const b2 = makeBattle();
  b2.units.push(
    makeUnit({ instanceId: "a", cardId: "pt_longgun", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "t", cardId: "pt_sloped", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const after2 = applyAction(b2, attack("a", "t"));
  const t2 = after2.units.find((u) => u.instanceId === "t")!;
  // Long gun negates the 2 frontal armor: full 3 damage.
  check("Длинный ствол: пробивает наклонную броню в лоб", t2.currentHp === 10 - 3, `hp ${t2.currentHp}`);
}

// 2. Слабые борта: фланговый удар наносит +2, лобовой — как обычно.
{
  const flank = makeBattle();
  flank.units.push(
    makeUnit({ instanceId: "a", cardId: "pt_plain", ownerId: "player", position: { row: 2, col: 2 } }), // разный ряд = фланг
    makeUnit({ instanceId: "t", cardId: "pt_flank", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const afterFlank = applyAction(flank, attack("a", "t"));
  const tf = afterFlank.units.find((u) => u.instanceId === "t")!;
  check("Слабые борта: фланговый удар +2", tf.currentHp === 10 - (3 + 2), `hp ${tf.currentHp}`);

  const front = makeBattle();
  front.units.push(
    makeUnit({ instanceId: "a", cardId: "pt_plain", ownerId: "player", position: { row: 1, col: 1 } }), // тот же ряд, спереди
    makeUnit({ instanceId: "t", cardId: "pt_flank", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const afterFront = applyAction(front, attack("a", "t"));
  const tfr = afterFront.units.find((u) => u.instanceId === "t")!;
  check("Слабые борта: лобовой удар без штрафа", tfr.currentHp === 10 - 3, `hp ${tfr.currentHp}`);
}

// 3. Перегрев: атака поджигает двигатель (порог 1) и обездвиживает в этот ход.
{
  const b = makeBattle();
  b.units.push(
    makeUnit({ instanceId: "hot", cardId: "pt_hot", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "v", cardId: "pt_victim", ownerId: "bot", position: { row: 1, col: 2 } })
  );
  const after = applyAction(b, attack("hot", "v"));
  const hot = after.units.find((u) => u.instanceId === "hot")!;
  check("Перегрев: атака поджигает двигатель", hot.onFire === true, `onFire ${hot.onFire}`);
  check("Перегрев: горящая машина не может двигаться в этот ход", hot.alreadyMoved === true, `alreadyMoved ${hot.alreadyMoved}`);
}

// 4. Пожар: горящая (действовавшая) машина теряет 1 HP на старте хода, затем тушится в простое.
{
  let b = makeBattle();
  b.units.push(
    makeUnit({
      instanceId: "fire",
      cardId: "pt_victim",
      ownerId: "player",
      position: { row: 1, col: 1 },
      onFire: true,
      heatActedThisTurn: true, // «действовала» в прошлый ход → урон, а не тушение
    })
  );
  const hpBefore = getCard("pt_victim").hp;
  b = roundTrip(b); // старт хода игрока: пожар наносит урон
  const f1 = b.units.find((u) => u.instanceId === "fire")!;
  check("Пожар: −1 HP на старте хода", f1.currentHp === hpBefore - 1, `hp ${f1.currentHp}`);
  check("Пожар: горящая машина обездвижена", f1.alreadyMoved === true, `alreadyMoved ${f1.alreadyMoved}`);

  // Машина простояла ход (heatActedThisTurn сброшен) → экипаж тушит пожар.
  b = roundTrip(b);
  const f2 = b.units.find((u) => u.instanceId === "fire")!;
  check("Пожар: простой ход тушит пожар", f2.onFire !== true, `onFire ${f2.onFire}`);
  check("Пожар: после тушения нет доп. урона", f2.currentHp === hpBefore - 1, `hp ${f2.currentHp}`);
}

// 5. Обездвижен: машина не может двигаться (но существует), пока её не починят.
{
  let b = makeBattle();
  b.units.push(
    makeUnit({
      instanceId: "imm",
      cardId: "pt_victim",
      ownerId: "player",
      position: { row: 1, col: 1 },
      immobilized: true,
    })
  );
  const moved = applyAction(b, { type: "MOVE_UNIT", playerId: "player", unitId: "imm", position: { row: 1, col: 2 } });
  const im = moved.units.find((u) => u.instanceId === "imm")!;
  check("Обездвижен: движение заблокировано", im.position.col === 1, `col ${im.position.col}`);
}

// 6. Ремонтная летучка: тушит пожар, освобождает обездвиженную машину и лечит.
{
  let b = makeBattle();
  b.units.push(
    makeUnit({ instanceId: "berge", cardId: "pt_berge", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({
      instanceId: "broken",
      cardId: "pt_victim",
      ownerId: "player",
      position: { row: 1, col: 2 }, // соседняя клетка
      onFire: true,
      immobilized: true,
      heatActedThisTurn: true,
      currentHp: 5,
    })
  );
  b = roundTrip(b); // старт хода игрока: ремонт срабатывает ДО пожара
  const fixed = b.units.find((u) => u.instanceId === "broken")!;
  check("Ремлетучка: пожар потушен", fixed.onFire !== true, `onFire ${fixed.onFire}`);
  check("Ремлетучка: обездвиживание снято", fixed.immobilized !== true, `immobilized ${fixed.immobilized}`);
  check("Ремлетучка: машина подлечена (без урона от пожара)", fixed.currentHp === 6, `hp ${fixed.currentHp}`);
}

// 8. «Перегрев» на ходу: прототип с deploymentDamage теряет 1 HP при движении,
//    когда бой включил движковый перегрев (3-я миссия «Первые Пантеры»).
{
  const origRandom = Math.random;

  Math.random = () => 0.1; // < 0.5 → перегрев срабатывает
  try {
    const b = makeBattle();
    b.overheatMovementDamage = true;
    const startHp = getCard("pt_proto").hp;
    b.units.push(
      makeUnit({ instanceId: "p", cardId: "pt_proto", ownerId: "player", position: { row: 1, col: 1 }, currentHp: startHp })
    );
    const moved = applyAction(b, { type: "MOVE_UNIT", playerId: "player", unitId: "p", position: { row: 1, col: 2 } });
    const p = moved.units.find((u) => u.instanceId === "p")!;
    check("Перегрев на ходу: −1 HP при движении (флаг вкл, бросок < 0.5)", p.currentHp === startHp - 1, `hp ${p.currentHp}`);
  } finally {
    Math.random = origRandom;
  }

  Math.random = () => 0.9; // ≥ 0.5 → перегрев не срабатывает
  try {
    const b = makeBattle();
    b.overheatMovementDamage = true;
    const startHp = getCard("pt_proto").hp;
    b.units.push(
      makeUnit({ instanceId: "p", cardId: "pt_proto", ownerId: "player", position: { row: 1, col: 1 }, currentHp: startHp })
    );
    const moved = applyAction(b, { type: "MOVE_UNIT", playerId: "player", unitId: "p", position: { row: 1, col: 2 } });
    const p = moved.units.find((u) => u.instanceId === "p")!;
    check("Перегрев на ходу: нет урона при броске ≥ 0.5", p.currentHp === startHp, `hp ${p.currentHp}`);
  } finally {
    Math.random = origRandom;
  }

  Math.random = () => 0.1;
  try {
    const b = makeBattle(); // флаг выключен (миссии 1–2)
    const startHp = getCard("pt_proto").hp;
    b.units.push(
      makeUnit({ instanceId: "p", cardId: "pt_proto", ownerId: "player", position: { row: 1, col: 1 }, currentHp: startHp })
    );
    const moved = applyAction(b, { type: "MOVE_UNIT", playerId: "player", unitId: "p", position: { row: 1, col: 2 } });
    const p = moved.units.find((u) => u.instanceId === "p")!;
    check("Перегрев на ходу: нет урона без флага (миссии 1–2)", p.currentHp === startHp, `hp ${p.currentHp}`);
  } finally {
    Math.random = origRandom;
  }
}

// 7. Кампанийные карты и колоды существуют и валидны.
{
  const ids = ["t34_beute", "vk3001_db", "vk3002_man", "panther_d", "panther_a", "panther_534", "bergepanther"];
  for (const id of ids) {
    check(`Карта существует: ${id}`, cards.some((c) => c.id === id));
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
