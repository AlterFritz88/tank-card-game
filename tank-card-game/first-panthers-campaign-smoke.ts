/* Validates the «Первые Пантеры» campaign wiring end-to-end.
   Run: npx tsx first-panthers-campaign-smoke.ts */
import { createInitialBattleState, getDeckCardIds } from "./src/game/initialState";
import { applyAction } from "./src/game/engine";
import { getCard } from "./src/game/cards";
import { HEADQUARTERS } from "./src/game/headquarters";
import {
  CAMPAIGNS,
  CAMPAIGN_COMPLETION_REWARDS,
} from "./src/game/campaigns";

let failures = 0;
function check(name: string, cond: boolean, details = "") {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name} ${details}`);
  }
}

const campaign = CAMPAIGNS.find((c) => c.id === "first-panthers")!;
check("Кампания найдена", !!campaign);
check("Кампания платная (premium)", campaign.premium === true);
check("12 миссий", campaign.missions.length === 12, `${campaign.missions.length}`);

// Capture missing-card / missing-deck warnings.
const warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...args: unknown[]) => warnings.push(args.join(" "));

for (const mission of campaign.missions) {
  const playerHq = mission.playerHeadquartersId ?? campaign.playerHeadquartersId;
  const botHq = mission.botHeadquartersId!;
  check(`${mission.id}: штаб игрока существует (${playerHq})`, !!HEADQUARTERS[playerHq]);
  check(`${mission.id}: штаб бота существует (${botHq})`, !!HEADQUARTERS[botHq]);

  const playerDeck = getDeckCardIds(mission.playerDeckId ?? campaign.playerDeckId);
  const botDeck = getDeckCardIds(mission.botDeckId!);
  check(`${mission.id}: колода игрока непуста`, playerDeck.length > 0, `${playerDeck.length}`);
  check(`${mission.id}: колода бота непуста`, botDeck.length > 0, `${botDeck.length}`);

  // Preplaced cards must exist.
  for (const u of mission.playerBoardUnits ?? []) {
    check(`${mission.id}: преплейсд ${u.cardId} существует`, !!getCard(u.cardId));
  }

  let state = createInitialBattleState({
    playerHeadquartersId: playerHq,
    botHeadquartersId: botHq,
    playerDeckId: mission.playerDeckId ?? campaign.playerDeckId,
    botDeckId: mission.botDeckId,
    playerBoardUnits: mission.playerBoardUnits,
    botBoardUnits: mission.botBoardUnits,
  });
  state = applyAction(state, { type: "BEGIN_BATTLE", startingPlayer: "player" });
  check(`${mission.id}: бой стартует (active)`, state.status === "active", state.status);

  const preplacedCount = (mission.playerBoardUnits ?? []).length;
  const onBoard = state.units.filter((u) => u.ownerId === "player").length;
  check(`${mission.id}: преплейсд-юниты на поле`, onBoard >= preplacedCount, `${onBoard}/${preplacedCount}`);

  // Scripted breakdown statuses landed on the units.
  for (const u of mission.playerBoardUnits ?? []) {
    if (u.status?.onFire) {
      const found = state.units.find((x) => x.cardId === u.cardId && x.onFire);
      check(`${mission.id}: ${u.cardId} стартует горящим`, !!found);
    }
    if (u.status?.immobilized) {
      const found = state.units.find((x) => x.cardId === u.cardId && x.immobilized);
      check(`${mission.id}: ${u.cardId} стартует обездвиженным`, !!found);
    }
  }
}

console.warn = origWarn;

// No missing-card warnings for our decks.
const relevant = warnings.filter((w) =>
  /kummersdorf_campaign|panther_kummersdorf_deck|panther_forming_deck|panther_regiment_campaign|soviet_kursk_defense_campaign/.test(w)
);
check("Нет предупреждений о недостающих картах в наших колодах", relevant.length === 0, relevant.join(" | "));

// Reward chain references existing cards + real missions.
const rewardIds = ["first_panthers_man", "first_panthers_serial", "first_panthers_ausf_a", "first_panthers_ace"];
const missionIdSet = new Set(campaign.missions.map((m) => m.id));
for (const rid of rewardIds) {
  const reward = CAMPAIGN_COMPLETION_REWARDS.find((r) => r.id === rid)!;
  check(`Награда ${rid} существует`, !!reward);
  check(`Награда ${rid}: карта существует (${reward?.cardId})`, !!reward && !!getCard(reward.cardId));
  check(
    `Награда ${rid}: все миссии из кампании`,
    !!reward && reward.missionIds.every((m) => missionIdSet.has(m)),
    reward?.missionIds.join(",")
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
