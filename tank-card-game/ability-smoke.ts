/* Temporary smoke test for headquarters abilities. Run: npx tsx ability-smoke.ts */
import { createInitialBattleState } from "./src/game/initialState";
import {
  applyAction,
  getEffectiveCardCost,
  getHeadquartersAttackValue,
  getUnitDisplayAttackValue,
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

function makeBattle(playerHq: HeadquartersId, deckCard: string): BattleState {
  const state = createInitialBattleState({
    playerHeadquartersId: playerHq,
    playerDeckCardIds: Array.from({ length: 40 }, () => deckCard),
  });

  return applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });
}

function makeUnit(partial: Partial<BoardUnit> & { instanceId: string; cardId: string; ownerId: "player" | "bot" }): BoardUnit {
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

// 1. Моторизованный марш: первый юнит за ход на 1 топливо дешевле.
{
  const battle = makeBattle("german_motorized_division", "panzer_35t");
  const card = getCard("panzer_35t");
  const before = battle.player.resources;
  const first = applyAction(battle, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: battle.player.hand[0].instanceId,
    position: { row: 1, col: 0 },
  });
  const afterFirst = first.player.resources;
  const second = applyAction(first, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: first.player.hand[0].instanceId,
    position: { row: 1, col: 1 },
  });

  check(
    "29.Inf.mot: первый юнит дешевле на 1",
    before - afterFirst === card.cost - 1,
    `spent ${before - afterFirst}, expected ${card.cost - 1}`
  );
  check(
    "29.Inf.mot: второй юнит за полную стоимость",
    afterFirst - second.player.resources === card.cost,
    `spent ${afterFirst - second.player.resources}, expected ${card.cost}`
  );
}

// 2. Танковый клин: первый танк получает блиц.
{
  const battle = makeBattle("first_panzer_division", "panzer_iv");
  battle.player.resources = 10;
  const first = applyAction(battle, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: battle.player.hand[0].instanceId,
    position: { row: 1, col: 0 },
  });
  const firstUnit = first.units.find((unit) => unit.ownerId === "player");
  const second = applyAction(first, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: first.player.hand[0].instanceId,
    position: { row: 1, col: 1 },
  });
  const secondUnit = second.units.find(
    (unit) => unit.ownerId === "player" && unit.instanceId !== firstUnit?.instanceId
  );

  check(
    "1.Panzer-Div: первый средний танк с блицем",
    firstUnit?.alreadyMoved === false && firstUnit?.alreadyAttacked === false
  );
  check(
    "1.Panzer-Div: второй танк без блица",
    secondUnit?.alreadyMoved === true && secondUnit?.alreadyAttacked === true
  );
}

// 3. Артиллерийская подготовка: +1 к атаке штаба.
{
  const battle = makeBattle("german_artillery_division", "panzer_35t");

  check(
    "45.InfDiv: атака штаба 2+1=3",
    getHeadquartersAttackValue(battle, "player") === 3,
    `got ${getHeadquartersAttackValue(battle, "player")}`
  );
}

// 4. Снабжение по графику: добор каждый 3-й ход.
{
  let battle = makeBattle("german_rear_corps", "panzer_35t");
  const handSizes: number[] = [];

  while (battle.turn < 3 && battle.status === "active") {
    handSizes.push(battle.player.hand.length);
    battle = applyAction(battle, { type: "END_TURN", playerId: battle.activePlayer });
  }

  const handBeforeTurn3 = handSizes[handSizes.length - 1];

  check(
    "XIX.AK: на 3-м ходу добор двух карт (обычная + бонус)",
    battle.turn === 3 && battle.player.hand.length === handBeforeTurn3 + 2,
    `turn ${battle.turn}, hand ${battle.player.hand.length}, before ${handBeforeTurn3}`
  );
}

// 5. Быстрая переброска: лёгкие с блицем (без ограничения spawn-хода).
{
  const battle = makeBattle("soviet_motor_rifle_division", "t26_1931");
  const next = applyAction(battle, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: battle.player.hand[0].instanceId,
    position: { row: 1, col: 0 },
  });
  const unit = next.units.find((item) => item.ownerId === "player");

  check(
    "1-я Московская мсд: лёгкий юнит с блицем",
    unit?.alreadyMoved === false && unit?.spawnedThisTurn === false
  );
}

// 6. Танковая засада: неподвижный танк бьёт на +1.
{
  const battle = makeBattle("soviet_tank_brigade", "t34_76");
  const t34 = getCard("t34_76");
  const targetCard = getCard("panzer_iv");

  battle.units.push(
    makeUnit({ instanceId: "p1", cardId: "t34_76", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "b1", cardId: "panzer_iv", ownerId: "bot", position: { row: 1, col: 2 } })
  );

  const next = applyAction(battle, {
    type: "ATTACK",
    playerId: "player",
    attackerType: "unit",
    attackerId: "p1",
    targetType: "unit",
    targetId: "b1",
  });
  const target = next.units.find((unit) => unit.instanceId === "b1");

  check(
    "4-я тбр: урон с засады +1",
    target?.currentHp === targetCard.hp - (t34.attack + 1),
    `hp ${target?.currentHp}, expected ${targetCard.hp - (t34.attack + 1)}`
  );
}

// 7. Залп «Катюш»: +1 урона штаба по повреждённой технике.
{
  const battle = makeBattle("soviet_guards_mortar_regiment", "t34_76");
  const targetCard = getCard("panzer_iv");

  battle.units.push(
    makeUnit({
      instanceId: "b1",
      cardId: "panzer_iv",
      ownerId: "bot",
      position: { row: 1, col: 2 },
      currentHp: targetCard.hp - 1,
    })
  );

  const hqAttack = getHeadquartersAttackValue(battle, "player");
  const next = applyAction(battle, {
    type: "ATTACK",
    playerId: "player",
    attackerType: "headquarters",
    attackerId: "player_hq",
    targetType: "unit",
    targetId: "b1",
  });
  const target = next.units.find((unit) => unit.instanceId === "b1");
  const expected = targetCard.hp - 1 - (hqAttack + 1);

  check(
    "13-й гв. минп: +1 урона по повреждённому",
    (target?.currentHp ?? 0) === expected || (expected <= 0 && !target),
    `hp ${target?.currentHp}, expected ${expected}`
  );
}

// 8. Ремонтные колонны: лечение юнита в начале хода.
{
  let battle = makeBattle("soviet_auto_battalion", "t34_76");
  const card = getCard("t34_76");

  battle.units.push(
    makeUnit({
      instanceId: "p1",
      cardId: "t34_76",
      ownerId: "player",
      position: { row: 2, col: 2 },
      currentHp: card.hp - 2,
    })
  );

  battle = applyAction(battle, { type: "END_TURN", playerId: "player" });
  battle = applyAction(battle, { type: "END_TURN", playerId: "bot" });

  const unit = battle.units.find((item) => item.instanceId === "p1");

  check(
    "389-й автобат: юнит подлечен на 1",
    unit?.currentHp === card.hp - 1,
    `hp ${unit?.currentHp}, expected ${card.hp - 1}`
  );
}

// 9. Combined Arms: +1 топлива при танке и поддержке на поле.
{
  let battle = makeBattle("usa_old_ironsides", "m4_sherman");
  const sherman = getCard("m4_sherman");
  const support = getCard("leig_18");

  battle.units.push(
    makeUnit({ instanceId: "p1", cardId: "m4_sherman", ownerId: "player", position: { row: 2, col: 2 } }),
    makeUnit({
      instanceId: "s1",
      cardId: "leig_18",
      ownerId: "player",
      zone: "support",
      supportSlot: 0,
      alreadyMoved: true,
      alreadyAttacked: true,
    })
  );

  battle = applyAction(battle, { type: "END_TURN", playerId: "player" });
  battle = applyAction(battle, { type: "END_TURN", playerId: "bot" });

  const expected =
    battle.headquarters.player.fuelGeneration +
    sherman.fuelGeneration +
    (support.supportEffects?.fuelPerTurn ?? 0) +
    1;

  check(
    "Old Ironsides: топливо с бонусом Combined Arms",
    battle.player.maxResources === expected,
    `max ${battle.player.maxResources}, expected ${expected}`
  );
}

// 10. Бронедесант: первый лёгкий юнит укрепляет штаб.
{
  const battle = makeBattle("usa_armored_infantry_regiment", "m3_stuart");
  const hpBefore = battle.headquarters.player.hp;
  const next = applyAction(battle, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: battle.player.hand[0].instanceId,
    position: { row: 1, col: 0 },
  });

  check(
    "6th Armored Infantry: штаб +1 HP",
    next.headquarters.player.hp === hpBefore + 1,
    `hp ${next.headquarters.player.hp}, expected ${hpBefore + 1}`
  );
}

// 11. Time on Target: удар штаба игнорирует прикрытие.
{
  const makeCoverTest = (playerHq: HeadquartersId) => {
    const battle = makeBattle(playerHq, "m4_sherman");

    battle.units.push(
      makeUnit({
        instanceId: "cover",
        cardId: "armata_75mm",
        ownerId: "bot",
        zone: "support",
        supportSlot: 0,
        alreadyMoved: true,
        alreadyAttacked: true,
      })
    );

    const fullAttack = getHeadquartersAttackValue(battle, "player");
    const hqHpBefore = battle.headquarters.bot.hp;
    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "headquarters",
      attackerId: "player_hq",
      targetType: "headquarters",
      targetId: "bot_hq",
    });

    return { fullAttack, hqDamage: hqHpBefore - next.headquarters.bot.hp };
  };

  const tot = makeCoverTest("usa_armored_artillery_battalion");
  const base = makeCoverTest("usa_old_ironsides");

  check(
    "27th Armored FA: урон по штабу не перехвачен (полная атака)",
    tot.hqDamage === tot.fullAttack,
    `damage ${tot.hqDamage}, attack ${tot.fullAttack}`
  );
  check(
    "Контроль: без TOT прикрытие перехватывает 1 урон",
    base.hqDamage === base.fullAttack - 1,
    `damage ${base.hqDamage}, attack ${base.fullAttack}`
  );
}

// 12. Эвакуация и ремонт: первый уничтоженный юнит возвращается в руку.
{
  const battle = makeBattle("usa_maintenance_battalion", "m4_sherman");

  battle.units.push(
    makeUnit({
      instanceId: "p1",
      cardId: "m3_stuart",
      ownerId: "player",
      position: { row: 1, col: 2 },
      currentHp: 1,
    }),
    makeUnit({ instanceId: "b1", cardId: "panzer_iv", ownerId: "bot", position: { row: 1, col: 3 } })
  );
  battle.activePlayer = "bot";

  const next = applyAction(battle, {
    type: "ATTACK",
    playerId: "bot",
    attackerType: "unit",
    attackerId: "b1",
    targetType: "unit",
    targetId: "p1",
  });

  const inHand = next.player.hand.some((card) => card.instanceId === "p1");
  const inDiscard = next.player.discard.some((card) => card.instanceId === "p1");

  check(
    "123rd Maintenance: юнит вернулся в руку, не в сброс",
    inHand && !inDiscard,
    `inHand ${inHand}, inDiscard ${inDiscard}`
  );
}

// 13. Тяжёлые танки: за ход либо движение, либо атака.
{
  // Движение запрещает атаку.
  const moveBattle = makeBattle("training_unit", "t26_1931");

  moveBattle.units.push(
    makeUnit({ instanceId: "h1", cardId: "tiger_i", ownerId: "player", position: { row: 1, col: 1 } })
  );

  const afterMove = applyAction(moveBattle, {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: "h1",
    position: { row: 1, col: 2 },
  });
  const movedHeavy = afterMove.units.find((unit) => unit.instanceId === "h1");

  check(
    "Тяжёлый танк: после движения атака недоступна",
    movedHeavy?.alreadyMoved === true && movedHeavy?.alreadyAttacked === true,
    `moved ${movedHeavy?.alreadyMoved}, attacked ${movedHeavy?.alreadyAttacked}`
  );

  // Атака запрещает движение.
  const attackBattle = makeBattle("training_unit", "t26_1931");

  attackBattle.units.push(
    makeUnit({ instanceId: "h1", cardId: "tiger_i", ownerId: "player", position: { row: 1, col: 1 } }),
    makeUnit({ instanceId: "b1", cardId: "panzer_iv", ownerId: "bot", position: { row: 1, col: 2 } })
  );

  const afterAttack = applyAction(attackBattle, {
    type: "ATTACK",
    playerId: "player",
    attackerType: "unit",
    attackerId: "h1",
    targetType: "unit",
    targetId: "b1",
  });
  const attackedHeavy = afterAttack.units.find((unit) => unit.instanceId === "h1");

  check(
    "Тяжёлый танк: после атаки движение недоступно",
    attackedHeavy?.alreadyAttacked === true && attackedHeavy?.alreadyMoved === true,
    `attacked ${attackedHeavy?.alreadyAttacked}, moved ${attackedHeavy?.alreadyMoved}`
  );

  // Контроль: средний танк после движения всё ещё может атаковать.
  const mediumBattle = makeBattle("training_unit", "t26_1931");

  mediumBattle.units.push(
    makeUnit({ instanceId: "m1", cardId: "panzer_iv", ownerId: "player", position: { row: 1, col: 1 } })
  );

  const afterMediumMove = applyAction(mediumBattle, {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: "m1",
    position: { row: 1, col: 2 },
  });
  const movedMedium = afterMediumMove.units.find((unit) => unit.instanceId === "m1");

  check(
    "Контроль: средний танк после движения может атаковать",
    movedMedium?.alreadyMoved === true && movedMedium?.alreadyAttacked === false,
    `moved ${movedMedium?.alreadyMoved}, attacked ${movedMedium?.alreadyAttacked}`
  );
}

// 14. Статистика: уничтоженный тыловой юнит идёт в категорию support, не в класс.
{
  const battle = makeBattle("training_unit", "t26_1931");

  battle.units.push(
    makeUnit({
      instanceId: "sup1",
      cardId: "leig_18",
      ownerId: "bot",
      zone: "support",
      supportSlot: 0,
      position: { row: 0, col: 4 },
      currentHp: 1,
      alreadyMoved: true,
      alreadyAttacked: true,
    })
  );

  const next = applyAction(battle, {
    type: "ATTACK",
    playerId: "player",
    attackerType: "headquarters",
    attackerId: "player_hq",
    targetType: "unit",
    targetId: "sup1",
  });

  check(
    "Статистика: тыловой юнит посчитан в support",
    next.stats.destroyedByPlayer.support === 1 &&
      next.stats.destroyedByPlayer.spg === 0,
    `support ${next.stats.destroyedByPlayer.support}, spg ${next.stats.destroyedByPlayer.spg}`
  );
}

// 14. Бот учитывает скидку «Моторизованного марша» при планировании.
{
  const runBotWithFuel = (botHq: HeadquartersId): boolean => {
    let state = applyAction(
      createInitialBattleState({
        botHeadquartersId: botHq,
        botDeckCardIds: Array.from({ length: 40 }, () => "panzer_35t"),
      }),
      { type: "BEGIN_BATTLE", startingPlayer: "bot" }
    );

    // Топлива меньше полной стоимости (2): сыграть можно только со скидкой.
    state.bot.resources = 1;

    let guard = 0;

    while (guard < 15) {
      guard += 1;
      const action = getNextBotAction(state);

      if (!action || action.type === "END_TURN") return false;
      if (action.type === "PLAY_CARD") return true;

      state = applyAction(state, action);
    }

    return false;
  };

  const discountedState = applyAction(
    createInitialBattleState({
      botHeadquartersId: "german_motorized_division",
      botDeckCardIds: Array.from({ length: 40 }, () => "panzer_35t"),
    }),
    { type: "BEGIN_BATTLE", startingPlayer: "bot" }
  );

  check(
    "Эффективная стоимость первого юнита со скидкой = 1",
    getEffectiveCardCost(discountedState, "bot", "panzer_35t") === 1,
    `got ${getEffectiveCardCost(discountedState, "bot", "panzer_35t")}`
  );
  check(
    "Бот 29.Inf.mot играет карту при 1 топливе (цена 2, скидка 1)",
    runBotWithFuel("german_motorized_division")
  );
  check(
    "Контроль: бот без скидки карту при 1 топливе не играет",
    !runBotWithFuel("first_panzer_division")
  );
}

// 15. Противотанковый заслон (supportLineCover).
{
  const makeCoverBattle = () => {
    const battle = makeBattle("training_unit", "t34_76");

    battle.units.push(
      makeUnit({
        instanceId: "cover",
        cardId: "gun_53k",
        ownerId: "bot",
        zone: "support",
        supportSlot: 0,
        alreadyMoved: true,
        alreadyAttacked: true,
      }),
      makeUnit({
        instanceId: "medic",
        cardId: "gaz_55_ambulance",
        ownerId: "bot",
        zone: "support",
        supportSlot: 1,
        alreadyMoved: true,
        alreadyAttacked: true,
      })
    );

    return battle;
  };

  // а) Дистанционный удар штаба по тыловому юниту принимает заслон.
  {
    const battle = makeCoverBattle();
    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "headquarters",
      attackerId: "player_hq",
      targetType: "unit",
      targetId: "medic",
    });
    const cover = next.units.find((unit) => unit.instanceId === "cover");
    const medic = next.units.find((unit) => unit.instanceId === "medic");

    check(
      "Заслон: удар штаба по санитарке уходит в 45-мм 53-К",
      cover?.currentHp === 1 && medic?.currentHp === getCard("gaz_55_ambulance").hp,
      `cover hp ${cover?.currentHp}, medic hp ${medic?.currentHp}`
    );
  }

  // б) Дальний выстрел САУ по тылу — тоже в заслон.
  {
    const battle = makeCoverBattle();

    battle.units.push(
      makeUnit({ instanceId: "spg", cardId: "su_122", ownerId: "player", position: { row: 1, col: 1 } })
    );

    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "unit",
      attackerId: "spg",
      targetType: "unit",
      targetId: "medic",
    });
    const cover = next.units.find((unit) => unit.instanceId === "cover");
    const medic = next.units.find((unit) => unit.instanceId === "medic");

    check(
      "Заслон: выстрел САУ по санитарке уничтожает заслон, санитарка цела",
      !cover && Boolean(medic),
      `cover ${Boolean(cover)}, medic ${Boolean(medic)}`
    );
  }

  // в) Ближний рейд: атакующий получает 2 урона упреждающим огнём.
  {
    const battle = makeCoverBattle();

    battle.units.push(
      makeUnit({ instanceId: "raider", cardId: "bt_7", ownerId: "player", position: { row: 2, col: 4 } })
    );

    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "unit",
      attackerId: "raider",
      targetType: "unit",
      targetId: "medic",
    });
    const raider = next.units.find((unit) => unit.instanceId === "raider");
    const medic = next.units.find((unit) => unit.instanceId === "medic");

    check(
      "Заслон: рейдер получает 2 урона, но добивает цель",
      raider?.currentHp === getCard("bt_7").hp - 2 && !medic,
      `raider hp ${raider?.currentHp}, medic ${Boolean(medic)}`
    );
  }

  // г) Слабый рейдер уничтожается заслоном — атака срывается.
  {
    const battle = makeCoverBattle();

    battle.units.push(
      makeUnit({
        instanceId: "weak",
        cardId: "t27",
        ownerId: "player",
        position: { row: 2, col: 4 },
        currentHp: 1,
      })
    );

    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "unit",
      attackerId: "weak",
      targetType: "unit",
      targetId: "medic",
    });
    const weak = next.units.find((unit) => unit.instanceId === "weak");
    const medic = next.units.find((unit) => unit.instanceId === "medic");

    check(
      "Заслон: слабый рейдер уничтожен, атака сорвана",
      !weak && medic?.currentHp === getCard("gaz_55_ambulance").hp,
      `weak ${Boolean(weak)}, medic hp ${medic?.currentHp}`
    );
  }

  // д) Заслон стреляет один раз за ход: второй рейдер проходит без огня.
  {
    const battle = makeCoverBattle();

    battle.units.push(
      makeUnit({ instanceId: "r1", cardId: "bt_7", ownerId: "player", position: { row: 2, col: 4 } }),
      makeUnit({ instanceId: "r2", cardId: "bt_5", ownerId: "player", position: { row: 1, col: 4 } })
    );

    let next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "unit",
      attackerId: "r1",
      targetType: "unit",
      targetId: "cover",
    });
    next = applyAction(next, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "unit",
      attackerId: "r2",
      targetType: "unit",
      targetId: "medic",
    });

    const r2 = next.units.find((unit) => unit.instanceId === "r2");

    check(
      "Заслон: второй рейдер за ход не получает упреждающего огня",
      r2?.currentHp === getCard("bt_5").hp,
      `r2 hp ${r2?.currentHp}`
    );
  }
}

// 16. ГАЗ-М1: каждый второй ход доставляет карту поддержки из колоды в руку.
{
  let battle = makeBattle("training_unit", "t34_76");

  // Колода игрока: вставим карту поддержки в глубину колоды.
  battle.player.deck.push({ instanceId: "support_in_deck", cardId: "gun_76_1927" });
  battle.units.push(
    makeUnit({
      instanceId: "emka",
      cardId: "gaz_m1",
      ownerId: "player",
      zone: "support",
      supportSlot: 0,
      alreadyMoved: true,
      alreadyAttacked: true,
    })
  );

  // Ход 2 наступает после END_TURN игрока и бота.
  battle = applyAction(battle, { type: "END_TURN", playerId: "player" });
  battle = applyAction(battle, { type: "END_TURN", playerId: "bot" });

  const inHand = battle.player.hand.some(
    (card) => card.instanceId === "support_in_deck"
  );

  check(
    "ГАЗ-М1: карта поддержки из колоды доставлена в руку на 2-м ходу",
    battle.turn === 2 && inHand,
    `turn ${battle.turn}, inHand ${inHand}`
  );
}

// 17. Противотанковый заслон защищает штаб.
{
  // а) Ближний рейд на штаб встречает упреждающий огонь заслона.
  {
    const battle = makeBattle("training_unit", "t34_76");

    battle.units.push(
      makeUnit({
        instanceId: "cover",
        cardId: "gun_53k",
        ownerId: "bot",
        zone: "support",
        supportSlot: 0,
        alreadyMoved: true,
        alreadyAttacked: true,
      }),
      makeUnit({
        instanceId: "raider",
        cardId: "panzer_iv",
        ownerId: "player",
        position: { row: 0, col: 3 },
      })
    );

    const hqHpBefore = battle.headquarters.bot.hp;
    const raidAttack = getCard("panzer_iv").attack;
    const coverDmg = getCard("gun_53k").supportEffects?.supportLineCover ?? 0;

    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "unit",
      attackerId: "raider",
      targetType: "headquarters",
      targetId: "bot_hq",
    });
    const raider = next.units.find((unit) => unit.instanceId === "raider");

    check(
      "Заслон: рейд по штабу — атакующий получает ответный огонь",
      raider?.currentHp === getCard("panzer_iv").hp - coverDmg &&
        next.headquarters.bot.hp === hqHpBefore - raidAttack,
      `raider hp ${raider?.currentHp}, hq ${next.headquarters.bot.hp}/${hqHpBefore}`
    );
  }

  // б) Дистанционный удар штаба по штабу частично принимает заслон.
  {
    const battle = makeBattle("training_unit", "t34_76");

    battle.units.push(
      makeUnit({
        instanceId: "cover",
        cardId: "pak38",
        ownerId: "bot",
        zone: "support",
        supportSlot: 0,
        alreadyMoved: true,
        alreadyAttacked: true,
      })
    );

    const hqAttack = getHeadquartersAttackValue(battle, "player");
    const hqHpBefore = battle.headquarters.bot.hp;
    const coverDmg = getCard("pak38").supportEffects?.supportLineCover ?? 0;
    const soaked = Math.min(coverDmg, hqAttack);

    const next = applyAction(battle, {
      type: "ATTACK",
      playerId: "player",
      attackerType: "headquarters",
      attackerId: "player_hq",
      targetType: "headquarters",
      targetId: "bot_hq",
    });
    const cover = next.units.find((unit) => unit.instanceId === "cover");

    check(
      "Заслон: дистанционный удар по штабу частично гасит заслон",
      next.headquarters.bot.hp === hqHpBefore - (hqAttack - soaked) &&
        cover?.currentHp === getCard("pak38").hp - soaked,
      `hq ${next.headquarters.bot.hp}/${hqHpBefore}, cover ${cover?.currentHp}`
    );
  }
}

// 18. Самооборона: SdKfz 251 отвечает на прямую атаку юнита.
{
  const battle = makeBattle("training_unit", "t34_76");

  battle.units.push(
    makeUnit({
      instanceId: "halftrack",
      cardId: "sdkfz_251",
      ownerId: "bot",
      zone: "support",
      supportSlot: 0,
      alreadyMoved: true,
      alreadyAttacked: true,
    }),
    makeUnit({
      instanceId: "raider",
      cardId: "panzer_iv",
      ownerId: "player",
      position: { row: 1, col: 4 },
    })
  );

  const returnFire = getCard("sdkfz_251").supportEffects?.returnFire ?? 0;
  const next = applyAction(battle, {
    type: "ATTACK",
    playerId: "player",
    attackerType: "unit",
    attackerId: "raider",
    targetType: "unit",
    targetId: "halftrack",
  });
  const raider = next.units.find((unit) => unit.instanceId === "raider");
  const halftrack = next.units.find((unit) => unit.instanceId === "halftrack");

  check(
    "Самооборона: SdKfz 251 отвечает огнём по атакующему",
    returnFire > 0 &&
      raider?.currentHp === getCard("panzer_iv").hp - returnFire &&
      !halftrack,
    `raider hp ${raider?.currentHp}, halftrack ${Boolean(halftrack)}`
  );
}

// 4-я тбр: свежеразвёрнутый танк не получает бонус засады в ход спавна,
// но на следующий ход (если стоит на месте) бьёт на +1.
{
  const battle = makeBattle("soviet_tank_brigade", "t34_76");
  battle.player.resources = 10;
  const card = getCard("t34_76");

  const deployed = applyAction(battle, {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: battle.player.hand[0].instanceId,
    position: { row: 1, col: 0 },
  });
  const unitId = deployed.units.find((u) => u.ownerId === "player")!.instanceId;
  const fresh = deployed.units.find((u) => u.instanceId === unitId)!;

  check(
    "4-я тбр: свежеразвёрнутый танк без бонуса засады",
    getUnitDisplayAttackValue(deployed, fresh) === card.attack,
    `display ${getUnitDisplayAttackValue(deployed, fresh)}, expected ${card.attack}`
  );

  let cycled = applyAction(deployed, { type: "END_TURN", playerId: "player" });
  cycled = applyAction(cycled, { type: "END_TURN", playerId: "bot" });
  const settled = cycled.units.find((u) => u.instanceId === unitId)!;

  check(
    "4-я тбр: на следующий ход неподвижный танк бьёт на +1",
    getUnitDisplayAttackValue(cycled, settled) === card.attack + 1,
    `display ${getUnitDisplayAttackValue(cycled, settled)}, expected ${card.attack + 1}`
  );
}

// 4-я тбр: лёгкий танк теряет бонус засады на первом перемещении, второе
// перемещение очки атаки уже не меняет (значит, и анимации изменения нет).
{
  const battle = makeBattle("soviet_tank_brigade", "t26_1931");
  const card = getCard("t26_1931");

  battle.units.push(
    makeUnit({
      instanceId: "light",
      cardId: "t26_1931",
      ownerId: "player",
      position: { row: 1, col: 1 },
    })
  );

  const beforeUnit = battle.units.find((u) => u.instanceId === "light")!;
  const attackBefore = getUnitDisplayAttackValue(battle, beforeUnit);

  const afterFirst = applyAction(battle, {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: "light",
    position: { row: 1, col: 2 },
  });
  const firstUnit = afterFirst.units.find((u) => u.instanceId === "light")!;
  const attackAfterFirst = getUnitDisplayAttackValue(afterFirst, firstUnit);

  const afterSecond = applyAction(afterFirst, {
    type: "MOVE_UNIT",
    playerId: "player",
    unitId: "light",
    position: { row: 1, col: 3 },
  });
  const secondUnit = afterSecond.units.find((u) => u.instanceId === "light")!;
  const attackAfterSecond = getUnitDisplayAttackValue(afterSecond, secondUnit);

  check(
    "4-я тбр: лёгкий танк до хода бьёт на +1",
    attackBefore === card.attack + 1,
    `display ${attackBefore}, expected ${card.attack + 1}`
  );
  check(
    "4-я тбр: первое перемещение снимает бонус (−1)",
    attackAfterFirst === card.attack,
    `display ${attackAfterFirst}, expected ${card.attack}`
  );
  check(
    "4-я тбр: второе перемещение очки атаки не меняет",
    attackAfterSecond === attackAfterFirst,
    `display ${attackAfterSecond}, expected ${attackAfterFirst}`
  );
}

// 4.Panzer: бонус «острия наступления» действует только в свой ход.
{
  const battle = makeBattle("german_4_panzer", "panzer_iv");
  const card = getCard("panzer_iv");

  battle.units.push(
    makeUnit({
      instanceId: "p1",
      cardId: "panzer_iv",
      ownerId: "player",
      position: { row: 1, col: 1 },
      moveCountThisTurn: 1,
      alreadyMoved: true,
    })
  );

  const ownTurnUnit = battle.units.find((u) => u.instanceId === "p1")!;
  check(
    "4.Panzer: ходивший танк бьёт на +1 в свой ход",
    getUnitDisplayAttackValue(battle, ownTurnUnit) === card.attack + 1,
    `display ${getUnitDisplayAttackValue(battle, ownTurnUnit)}, expected ${card.attack + 1}`
  );

  const enemyTurn: BattleState = { ...battle, activePlayer: "bot" };
  const enemyTurnUnit = enemyTurn.units.find((u) => u.instanceId === "p1")!;
  check(
    "4.Panzer: в ход противника атака возвращается к базовой",
    getUnitDisplayAttackValue(enemyTurn, enemyTurnUnit) === card.attack,
    `display ${getUnitDisplayAttackValue(enemyTurn, enemyTurnUnit)}, expected ${card.attack}`
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
