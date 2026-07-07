import type { Campaign, CampaignMission } from "./campaigns";
import { getSettings, type Language } from "./settings";

type CampaignText = {
  title?: string;
  description?: string;
  briefingSpeaker?: string;
};

type MissionText = {
  chapter?: string;
  title?: string;
  description?: string;
  briefing?: string;
  victoryDebrief?: string;
  defeatDebrief?: string;
  playerCommanderName?: string;
};

const CAMPAIGN_TEXT_EN: Record<string, CampaignText> = {
  "welcome-kursk": {
    title: "Beast Slayer",
    description:
      "Kursk salient, July 1943. Near Ponyri, Model's 9th Army throws Tigers and Ferdinands into the breach. Stop the wedge for the Central Front and earn your first SU-152.",
    briefingSpeaker: "Front Headquarters",
  },
  "training-front": {
    title: "1. Panzer Div.",
    description:
      "The Polish campaign of 1939. Lead the 1st Panzer Division through a chain of battles.",
  },
  "lavrinenko-ace": {
    title: "Tank Ace Lavrinenko",
    description:
      "Autumn 1941. Lead the finest tank ace of the war and his 4th Tank Brigade from Mtsensk ambushes to the defense of Moscow.",
  },
  "raseiniai-kv": {
    title: "The Lone KV",
    description:
      "Lithuania, June 1941. The first days of the war: the 2nd Tank Division meets the 4th Panzer Group at Raseiniai, and then a single KV cuts a whole Wehrmacht battle group off its supply road for two days.",
    briefingSpeaker: "KV Commander",
  },
};

const MISSION_TEXT_EN: Record<string, MissionText> = {
  "welcome-kursk-1": {
    chapter: "Kursk Salient 1943 · Northern Face",
    title: "Ponyri Line",
    description:
      "July 13, 1943, Ponyri station. A damaged Tiger and Ferdinand from Model's 9th Army are stalled before our line. Finish them and hold the position.",
    briefing:
      "Ponyri, commander. A Tiger and a Ferdinand are stuck in front of us. Hit heavy armor first with artillery and headquarters fire, then finish it with tanks. T-34s, attack!",
    victoryDebrief:
      "The beasts are burning, and the line is ours. For this battle, the SU-152 'Beast Slayer' joins your unit. Their armor will no longer stop us.",
    defeatDebrief:
      "They broke through, damn them... but this is not over. We will regroup and meet them again.",
    playerCommanderName: "Commander",
  },
  "training-front-1": {
    chapter: "Poland 1939 · Fall Weiss",
    title: "Breakthrough at Rozprza",
    description:
      "September 1-3, 1939. Break through Polish fortifications and reach the Warta River. Enemy: elements of the 7th Polish Infantry Division and cavalry brigades.",
  },
  "training-front-2": {
    chapter: "Poland 1939 · Fall Weiss",
    title: "Battles for Radom",
    description:
      "September 5-8, 1939. Encircle the Polish Prusy Army. Enemy: the 25th Polish Infantry Division and cavalry remnants.",
  },
  "training-front-3": {
    chapter: "Poland 1939 · Fall Weiss",
    title: "Battle of the Bzura",
    description:
      "September 16-20, 1939. Force the river and destroy the Polish grouping. Enemy: formations of the Pomorze Army.",
  },
  "training-front-4": {
    chapter: "Poland 1939 · Fall Weiss",
    title: "Drive on Warsaw's Outskirts",
    description:
      "September 20-28, 1939. Seize the suburbs and support the 18th Infantry Division. Enemy: the 1st and 13th Polish Infantry Divisions.",
  },
  "training-front-5": {
    chapter: "France and Belgium 1940 · Fall Gelb / Rot",
    title: "March Through the Ardennes",
    description:
      "May 10-12, 1940. Drive rapidly through the forests toward the Meuse. Enemy: Belgian Chasseurs Ardennais and light French units.",
  },
  "training-front-6": {
    chapter: "France and Belgium 1940 · Fall Gelb / Rot",
    title: "Assault on Sedan",
    description:
      "May 13-14, 1940. Cross the Meuse and capture the La Marfee heights. Enemy: the French 55th Infantry Division.",
  },
  "training-front-7": {
    chapter: "France and Belgium 1940 · Fall Gelb / Rot",
    title: "Dash to the Channel",
    description:
      "May 15-20, 1940. Execute a deep breakthrough and cut off the Allies. Enemy: elements of 1re DCR and British rearguards.",
  },
  "training-front-8": {
    chapter: "France and Belgium 1940 · Fall Gelb / Rot",
    title: "Fighting at Dunkirk",
    description:
      "May 25-31, 1940. Block the BEF evacuation. Enemy: British and French forces around Dunkirk.",
  },
  "training-front-9": {
    chapter: "France and Belgium 1940 · Fall Gelb / Rot",
    title: "Break the Weygand Line",
    description:
      "June 5-10, 1940. Break the second French defensive line. Enemy: colonial and infantry divisions.",
  },
  "training-front-10": {
    chapter: "France and Belgium 1940 · Fall Gelb / Rot",
    title: "Capture of Belfort",
    description:
      "June 17-22, 1940. Encircle French remnants near the Maginot Line. Enemy: fortress divisions and remnants of the 2nd Army.",
  },
  "training-front-11": {
    chapter: "Eastern Front 1941-1942",
    title: "Crossing the Soviet Border",
    description:
      "June 22, 1941, Lithuania. Open Operation Barbarossa. Enemy: the Soviet 5th Tank Division and border troops.",
  },
  "training-front-12": {
    chapter: "Eastern Front 1941-1942",
    title: "Daugavpils and Pskov",
    description:
      "July 1941. Capture crossings and push toward Luga. Enemy: the 24th Tank and 90th Rifle Divisions.",
  },
  "training-front-13": {
    chapter: "Eastern Front 1941-1942",
    title: "Advance on Leningrad",
    description:
      "August-September 1941. Break through the Luga sector. Enemy: elements of the 3rd Mechanized Corps and rifle divisions.",
  },
  "training-front-14": {
    chapter: "Eastern Front 1941-1942",
    title: "Battles Near Moscow",
    description:
      "October-December 1941. Continue the push toward Moscow. Enemy: Siberian divisions of the 20th and 16th Soviet Armies.",
  },
  "training-front-15": {
    chapter: "Eastern Front 1941-1942",
    title: "Defense of the Rzhev Salient",
    description:
      "January-March 1942. Hold positions after heavy armored losses. Enemy: the Soviet 29th and 39th Armies.",
  },
  "training-front-16": {
    chapter: "Southern Sector 1943-1945",
    title: "Counterattacks West of Kyiv",
    description:
      "November-December 1943. Stabilize the front after transfer from Greece. Enemy: the Soviet 1st Tank Army.",
  },
  "training-front-17": {
    chapter: "Southern Sector 1943-1945",
    title: "Relief of the Korsun Pocket",
    description:
      "January-February 1944. Break through toward encircled troops. Enemy: the 5th Guards Tank Army.",
  },
  "training-front-18": {
    chapter: "Southern Sector 1943-1945",
    title: "Escape from Hube's Pocket",
    description:
      "March 1944. Break out of encirclement in western Ukraine. Enemy: armored and mechanized corps of two Ukrainian Fronts.",
  },
  "training-front-19": {
    chapter: "Southern Sector 1943-1945",
    title: "Fighting for Budapest",
    description:
      "October 1944-January 1945. Counterattack near Debrecen and attempt to relieve the city. Enemy: the 3rd Ukrainian Front.",
  },
  "training-front-20": {
    chapter: "Southern Sector 1943-1945",
    title: "Final Battles at Balaton",
    description:
      "March-May 1945. Organize defense and withdrawal into Austria. Enemy: elements of the 6th Guards Tank Army.",
  },
  "lavrinenko-1": {
    chapter: "Donbass 1941 · Formation",
    title: "Baptism of Fire at Stalino",
    description:
      "September 1941. The first battle of the newly formed 4th Tank Brigade near Stalino.",
  },
  "lavrinenko-2": {
    chapter: "Mtsensk 1941 · Guderian",
    title: "First Warrior: Tank Ambush",
    description:
      "October 4, 1941, First Warrior station. Debut of ambush tactics.",
  },
  "lavrinenko-3": {
    chapter: "Mtsensk 1941 · Guderian",
    title: "Battles for Mtsensk",
    description:
      "October 6-11, 1941. Mobile defense against Guderian's corps.",
  },
  "lavrinenko-4": {
    chapter: "Redeployment",
    title: "March to Moscow",
    description:
      "October 1941. Trains roll toward Moscow: a short meeting engagement.",
  },
  "lavrinenko-5": {
    chapter: "Volokolamsk 1941",
    title: "Counterblow at Skirmanovo",
    description:
      "November 12-13, 1941. Counterattack against fortified Skirmanovo.",
  },
  "lavrinenko-6": {
    chapter: "Volokolamsk 1941",
    title: "A Lone T-34",
    description:
      "November 19, 1941, Gusenevo. One ace crew against a marching column.",
  },
  "lavrinenko-7": {
    chapter: "Volokolamsk 1941",
    title: "Shoulder to Shoulder with Panfilov",
    description:
      "November 16-20, 1941. Hold the line beside Panfilov's men.",
  },
  "lavrinenko-8": {
    chapter: "Guards",
    title: "Guards Banner",
    description:
      "November 22, 1941, Lystsevo. The brigade becomes the 1st Guards.",
  },
  "lavrinenko-9": {
    chapter: "Counteroffensive",
    title: "Turning Point Near Moscow",
    description:
      "December 6-10, 1941. Now we advance.",
  },
  "lavrinenko-10": {
    chapter: "Last Battle",
    title: "Goryuny, December 18",
    description:
      "December 18, 1941, Goryuny. The ace's final battle.",
  },
  "raseiniai-1": {
    chapter: "Lithuania 1941 · Border Battles",
    title: "Border in Flames",
    description:
      "June 22, 1941. The division is on the march toward the breakthrough. A German vanguard recon detachment blocks the road.",
  },
  "raseiniai-2": {
    chapter: "Lithuania 1941 · Border Battles",
    title: "Steel Ram at Skaudvilė",
    description:
      "June 23, 1941. The 2nd Tank Division counterattacks: KVs charge Kampfgruppe Seckendorff, and 37mm shells bounce off their armor.",
  },
  "raseiniai-3": {
    chapter: "Raseiniai · One Against a Division",
    title: "The Crossroads",
    description:
      "June 24, 1941. A lone KV takes position on the Raseiniai–Dubysa road and cuts Kampfgruppe Raus off its supplies.",
  },
  "raseiniai-4": {
    chapter: "Raseiniai · One Against a Division",
    title: "Night of the Sappers",
    description:
      "Night of June 25, 1941. German sappers creep toward the motionless tank with demolition charges.",
  },
  "raseiniai-5": {
    chapter: "Raseiniai · One Against a Division",
    title: "Eight-Eight",
    description:
      "June 25, 1941. Pz 35(t)s circle as a distraction while 8.8cm guns deploy in the rear — the lone KV's last stand.",
  },
};

export function getLocalizedCampaignTitle(
  campaign: Campaign,
  language: Language = getSettings().language
) {
  return language === "en"
    ? CAMPAIGN_TEXT_EN[campaign.id]?.title ?? campaign.title
    : campaign.title;
}

export function getLocalizedCampaignDescription(
  campaign: Campaign,
  language: Language = getSettings().language
) {
  return language === "en"
    ? CAMPAIGN_TEXT_EN[campaign.id]?.description ?? campaign.description
    : campaign.description;
}

export function getLocalizedMissionTitle(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.title ?? mission.title
    : mission.title;
}

export function getLocalizedMissionChapter(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.chapter ?? mission.chapter
    : mission.chapter;
}

export function getLocalizedMissionDescription(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.description ?? mission.description
    : mission.description;
}

export function getLocalizedCampaignSpeaker(
  campaign: Campaign,
  language: Language = getSettings().language
) {
  return language === "en"
    ? CAMPAIGN_TEXT_EN[campaign.id]?.briefingSpeaker ??
        campaign.briefingSpeaker
    : campaign.briefingSpeaker;
}

export function getLocalizedMissionBriefing(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.briefing ?? mission.briefing
    : mission.briefing;
}

export function getLocalizedMissionVictoryDebrief(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.victoryDebrief ?? mission.victoryDebrief
    : mission.victoryDebrief;
}

export function getLocalizedMissionDefeatDebrief(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.defeatDebrief ?? mission.defeatDebrief
    : mission.defeatDebrief;
}

export function getLocalizedMissionPlayerCommanderName(
  mission: CampaignMission,
  language: Language = getSettings().language
) {
  return language === "en"
    ? MISSION_TEXT_EN[mission.id]?.playerCommanderName ??
        mission.playerCommanderName
    : mission.playerCommanderName;
}
