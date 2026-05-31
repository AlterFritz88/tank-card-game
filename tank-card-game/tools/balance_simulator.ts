/**
 * Balance Simulator - 1. Panzer Division Campaign (Poland 1939)
 *
 * German side: Strong custom greedy AI (tuned for this simulation)
 * Polish side: Real production bot AI
 *
 * This gives fast, actionable balance data.
 *
 * Recommended run:
 *   cd tank-card-game/tank-card-game
 *   npx tsx tools/balance_simulator.ts
 */

import type { BattleAction, BattleState, Position } from "../src/game/types";

let createInitialBattleState: typeof import("../src/game/initialState").createInitialBattleState;
let applyAction: typeof import("../src/game/engine").applyAction;
let runBotTurn: typeof import("../src/game/bot").runBotTurn;
let getCard: typeof import("../src/game/cards").getCard;

async function loadModules() {
  const init = await import("../src/game/initialState");
  const engine = await import("../src/game/engine");
  const bot = await import("../src/game/bot");
  const cards = await import("../src/game/cards");

  createInitialBattleState = init.createInitialBattleState;
  applyAction = engine.applyAction;
  runBotTurn = bot.runBotTurn;
  getCard = cards.getCard;
}

// ============================================================
// Strong Greedy AI for German (Player) side during simulation
// ============================================================

function getGermanSpawnCells(): Position[] {
  return [
    { row: 1, col: 0 },
    { row: 1, col: 1 },
    { row: 2, col: 1 },
  ];
}

function getFreeGermanSpawnCell(state: BattleState): Position | null {
  const cells = getGermanSpawnCells();
  for (const cell of cells) {
    const occupied = state.units.some(
      (u) => u.position.row === cell.row && u.position.col === cell.col
    );
    if (!occupied) return cell;
  }
  return null;
}

function scoreCardForGermanPlay(state: BattleState, cardId: string): number {
  const card = getCard(cardId);
  let score = card.attack * 4 + card.hp * 1.5 + card.fuelGeneration * 7;

  if (card.class === "medium") score += 6;
  if (card.class === "heavy") score += 12;
  if (card.class === "td") score += 9;
  if (card.class === "spg") score += 5;

  // Early game: value cheap units more
  if (state.turn <= 5 && card.cost <= 2) score += 8;

  return score;
}

function getBestGermanPlayAction(state: BattleState): BattleAction | null {
  const hand = state.player.hand;
  const resources = state.player.resources;
  const spawnCell = getFreeGermanSpawnCell(state);
  if (!spawnCell) return null;

  const candidates = hand
    .map((inst) => ({
      inst,
      card: getCard(inst.cardId),
    }))
    .filter((c) => c.card.cost <= resources)
    .map((c) => ({
      ...c,
      score: scoreCardForGermanPlay(state, c.card.id),
    }))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;

  return {
    type: "PLAY_CARD",
    playerId: "player",
    cardInstanceId: candidates[0].inst.instanceId,
    position: spawnCell,
  };
}

function getGermanAttackActions(state: BattleState): AttackAction[] {
  const myUnits = state.units.filter((u) => u.ownerId === "player" && !u.alreadyAttacked);
  const actions: AttackAction[] = [];

  const enemyHq = state.headquarters.bot;

  for (const unit of myUnits) {
    const card = getCard(unit.cardId);

    // Try HQ first if in range
    const dist = Math.max(
      Math.abs(unit.position.row - enemyHq.position.row),
      Math.abs(unit.position.col - enemyHq.position.col)
    );

    const canHitHq =
      card.class === "spg" || (card.class === "td" ? dist === 1 : dist <= card.range);

    if (canHitHq) {
      actions.push({
        type: "ATTACK",
        playerId: "player",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: "headquarters",
        targetId: "bot_hq",
      });
      continue;
    }

    // Otherwise attack the most dangerous enemy unit in range
    const dangerousEnemies = state.units
      .filter((e) => e.ownerId === "bot")
      .map((e) => {
        const eCard = getCard(e.cardId);
        const eDist = Math.max(
          Math.abs(unit.position.row - e.position.row),
          Math.abs(unit.position.col - e.position.col)
        );
        const canReach =
          card.class === "spg" || (card.class === "td" ? eDist === 1 : eDist <= card.range);

        return { unit: e, card: eCard, canReach };
      })
      .filter((x) => x.canReach)
      .sort((a, b) => {
        // Prioritize high threat + high value targets
        const threatA = a.card.attack * 2 + a.card.fuelGeneration * 3;
        const threatB = b.card.attack * 2 + b.card.fuelGeneration * 3;
        return threatB - threatA;
      });

    if (dangerousEnemies.length > 0) {
      actions.push({
        type: "ATTACK",
        playerId: "player",
        attackerType: "unit",
        attackerId: unit.instanceId,
        targetType: "unit",
        targetId: dangerousEnemies[0].unit.instanceId,
      });
    }
  }

  return actions;
}

function getGermanMoveActions(state: BattleState): BattleAction[] {
  // Simple forward pressure moves toward enemy HQ
  const actions: BattleAction[] = [];
  const enemyHq = state.headquarters.bot;
  const myUnits = state.units.filter((u) => u.ownerId === "player" && !u.alreadyMoved);

  for (const unit of myUnits) {
    const card = getCard(unit.cardId);
    if (card.movement < 1) continue;

    // Try to move closer to enemy HQ (simple greedy)
    const currentDist = Math.max(
      Math.abs(unit.position.row - enemyHq.position.row),
      Math.abs(unit.position.col - enemyHq.position.col)
    );

    const possibleDeltas = [
      { row: -1, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: -1 },
      { row: 0, col: 1 },
    ];

    let bestPos = unit.position;
    let bestDist = currentDist;

    for (const d of possibleDeltas) {
      const newPos = {
        row: unit.position.row + d.row,
        col: unit.position.col + d.col,
      };

      // crude bounds
      if (newPos.row < 0 || newPos.row > 4 || newPos.col < 0 || newPos.col > 4) continue;

      const occupied = state.units.some(
        (u) => u.position.row === newPos.row && u.position.col === newPos.col
      );
      if (occupied) continue;

      const newDist = Math.max(
        Math.abs(newPos.row - enemyHq.position.row),
        Math.abs(newPos.col - enemyHq.position.col)
      );

      if (newDist < bestDist) {
        bestDist = newDist;
        bestPos = newPos;
      }
    }

    if (bestPos.row !== unit.position.row || bestPos.col !== unit.position.col) {
      actions.push({
        type: "MOVE_UNIT",
        playerId: "player",
        unitId: unit.instanceId,
        position: bestPos,
      });
    }
  }

  return actions;
}

function getNextGermanAction(state: BattleState): BattleAction | null {
  if (state.status !== "active" || state.activePlayer !== "player") return null;

  const resources = state.player.resources;

  // 1. Play a strong card if we can
  if (resources > 0) {
    const play = getBestGermanPlayAction(state);
    if (play) return play;
  }

  // 2. Attack with anything that can do damage (prefer HQ and high value targets)
  const attacks = getGermanAttackActions(state);
  if (attacks.length > 0) {
    // Sort attacks — prefer HQ attacks when possible
    attacks.sort((a, b) => {
      if (a.targetType === "headquarters" && b.targetType !== "headquarters") return -1;
      if (b.targetType === "headquarters" && a.targetType !== "headquarters") return 1;
      return 0;
    });
    return attacks[0];
  }

  // 3. Move units forward to apply pressure
  const moves = getGermanMoveActions(state);
  if (moves.length > 0) return moves[0];

  // 4. If we still have resources, try to play something cheap
  if (resources > 0) {
    const play = getBestGermanPlayAction(state);
    if (play) return play;
  }

  return { type: "END_TURN", playerId: "player" };
}

function runGermanTurn(state: BattleState): BattleState {
  let nextState = state;
  let actions = 0;

  while (
    nextState.status === "active" &&
    nextState.activePlayer === "player" &&
    actions < 14
  ) {
    const action = getNextGermanAction(nextState);
    if (!action) break;

    nextState = applyAction(nextState, action);
    actions++;

    if (action.type === "END_TURN") break;
  }

  return nextState;
}

// ============================================================
// Main simulation loop
// ============================================================

function runOneGame(germanDeck: string, polishDeck: string, maxTurns = 85) {
  let state: BattleState = createInitialBattleState({
    playerHeadquartersId: "first_panzer_division",
    botHeadquartersId: "polish_border_guard",
    playerDeckId: germanDeck,
    botDeckId: polishDeck,
    backgroundId: "base_1",
  });

  state = applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });

  let turns = 0;

  while (state.status === "active" && turns < maxTurns) {
    if (state.activePlayer === "bot") {
      state = runBotTurn(state);
    } else {
      state = runGermanTurn(state);
    }
    turns++;
  }

  let winner: "german" | "polish" | "draw";
  if (state.status === "player_won") winner = "german";
  else if (state.status === "bot_won") winner = "polish";
  else winner = "draw";

  return {
    winner,
    turns,
    germanHp: state.headquarters.player.hp,
    polishHp: state.headquarters.bot.hp,
  };
}

async function runMatchup(name: string, germanDeck: string, polishDeck: string, games: number) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(name);
  console.log(`Simulating ${games} games (German greedy AI vs Real Polish bot)...`);

  let german = 0,
    polish = 0,
    draw = 0;
  let sumTurns = 0;
  let sumGerHp = 0,
    sumPolHp = 0;

  const t0 = Date.now();

  for (let i = 0; i < games; i++) {
    const r = runOneGame(germanDeck, polishDeck);
    if (r.winner === "german") german++;
    else if (r.winner === "polish") polish++;
    else draw++;

    sumTurns += r.turns;
    sumGerHp += r.germanHp;
    sumPolHp += r.polishHp;

    if ((i + 1) % 30 === 0) process.stdout.write(".");
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const avgT = (sumTurns / games).toFixed(1);
  const avgGH = (sumGerHp / games).toFixed(1);
  const avgPH = (sumPolHp / games).toFixed(1);

  console.log(`\n\n  German wins: ${german}  (${((german / games) * 100).toFixed(1)}%)`);
  console.log(`  Polish wins: ${polish}  (${((polish / games) * 100).toFixed(1)}%)`);
  console.log(`  Draws:       ${draw}   (${((draw / games) * 100).toFixed(1)}%)`);
  console.log(`  Avg turns:   ${avgT}`);
  console.log(`  Avg German HQ HP: ${avgGH}`);
  console.log(`  Avg Polish HQ HP: ${avgPH}`);
  console.log(`  Time: ${dt}s`);
}

async function main() {
  await loadModules();

  console.log("=== 1. Panzer Division Campaign Balance Simulation ===");
  console.log("German: Strong greedy AI  |  Polish: Real production bot AI");
  console.log("225 games per matchup\n");

  const GAMES = 225;

  await runMatchup(
    "MISSION 1 — Прорыв границы (vs Border Guard)",
    "first_panzer_m1",
    "polish_border_guard_campaign",
    GAMES
  );

  await runMatchup(
    "MISSION 2 — Бои за Радом (vs Armia Łódź)",
    "first_panzer_m2",
    "polish_army_lodz_campaign",
    GAMES
  );

  await runMatchup(
    "MISSION 3 — Битва на Бзуре (vs Armia Prusy)",
    "first_panzer_m3",
    "polish_army_prusy_campaign",
    GAMES
  );

  await runMatchup(
    "MISSION 4 — Наступление на Варшаву (vs Warsaw Defense)",
    "first_panzer_m4",
    "polish_warsaw_defense_campaign",
    GAMES
  );

  console.log("\n\n=== Simulation finished ===");
}

main().catch(console.error);
