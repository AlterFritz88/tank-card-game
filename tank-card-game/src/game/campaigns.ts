import type { BattleBackgroundId } from "./battleBackgrounds";
import type { PreplacedUnit } from "./initialState";
import type { TutorialScriptId } from "./tutorial";
import type { BattleObjective, HeadquartersId } from "./types";

export type CampaignMission = {
  id: string;
  chapter: string;
  title: string;
  /** Short blurb shown on the mission card in the selection menu. */
  description: string;
  botHeadquartersId?: HeadquartersId;
  botDeckId?: string;
  playerDeckId?: string; // allows progressive player decks per mission
  playerHeadquartersId?: HeadquartersId; // overrides the campaign HQ for this mission
  backgroundId?: BattleBackgroundId;
  illustrationId?: string;
  available?: boolean;
  /** Units already on the board when the battle starts (scripted/trailer missions). */
  playerBoardUnits?: PreplacedUnit[];
  botBoardUnits?: PreplacedUnit[];
  /** Alternative victory condition for a scripted battle. */
  objective?: BattleObjective;
  /** Scripted opening-hand size: both players draw exactly this many cards. */
  startingHandSize?: number;
  /** Cards guaranteed to be present in the player's opening hand. */
  playerStartingHandCardIds?: string[];
  /**
   * Auto-launch this mission once, the first time the player opens the game
   * (the welcome trailer). Marked done via local storage so it never repeats.
   */
  autoLaunchOnFirstVisit?: boolean;
  /** Skip the first-turn roll and let the player always start (scripted intros). */
  skipFirstTurnRoll?: boolean;
  /** Skip the first-turn roll and let the enemy always start (scripted missions). */
  botStartsFirst?: boolean;
  /** Overrides the player's commander nameplate for this mission. */
  playerCommanderName?: string;
  /** Show the briefing/debrief dialogue centered on screen instead of at the bottom. */
  centeredDialogue?: boolean;
  /** Suppress the post-battle result screen (scripted endings handle their own flow). */
  skipResultScreen?: boolean;
  /** Trim the in-battle control buttons down to just pause (scripted intros). */
  minimalBattleControls?: boolean;
  /**
   * Scripted ending: on victory, after the debrief, skip the result screen and
   * instead grant + celebrate this campaign-completion reward, then drop the
   * player back to the main menu. Used by the welcome trailer.
   */
  endRewardId?: string;
  /**
   * Pre-battle narration delivered by the campaign avatar (see
   * `Campaign.briefingAvatarId`). Shown before the player can act, like the
   * tutorial prologue.
   */
  briefing?: string;
  /** Post-battle avatar line shown on victory, before the result screen. */
  victoryDebrief?: string;
  /** Post-battle avatar line shown on defeat, before the result screen. */
  defeatDebrief?: string;
  /**
   * Run this mission as a fully guided, guaranteed-win demo: step-by-step
   * instructions, highlighted targets, gated actions and a passive scripted bot
   * (see the matching script in `tutorial.ts`).
   */
  guidedScriptId?: TutorialScriptId;
};

export type Campaign = {
  id: string;
  title: string;
  description: string;
  playerHeadquartersId: HeadquartersId;
  playerDeckId: string;
  missions: CampaignMission[];
  /** Custom artwork for the campaign card in the selection menu. */
  menuArtUrl?: string;
  /**
   * Headquarters-avatar asset id used for the per-mission briefing/debrief
   * speaker. When set, missions with `briefing`/`debrief` text show the avatar.
   */
  briefingAvatarId?: string;
  /** Name shown above the briefing/debrief text. */
  briefingSpeaker?: string;
  /** Hide this campaign from the campaign-selection menu (e.g. the auto-launched trailer). */
  hiddenFromMenu?: boolean;
  /**
   * Paid campaign: shown in the menu but gated behind a purchase. The menu marks
   * it with a premium badge and blocks mission launch until unlocked. Free
   * campaigns leave this unset.
   */
  premium?: boolean;
  /** Permanent unlock price in gold tracks for a premium campaign. */
  goldCost?: number;
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "welcome-kursk",
    title: "Зверобой",
    description:
      "Курская дуга, июль 1943 года. У Понырей немецкая 9-я армия пытается прорвать оборону Центрального фронта. Останови атаку и получи СУ-152.",
    playerHeadquartersId: "soviet_central_front",
    playerDeckId: "welcome_kursk_player",
    briefingAvatarId: "soviet_central_front",
    briefingSpeaker: "Штаб фронта",
    hiddenFromMenu: true,
    missions: [
      {
        id: "welcome-kursk-1",
        chapter: "Курская дуга 1943 · Северный фас",
        title: "Рубеж у Понырей",
        description:
          "13 июля 1943 года, станция Поныри. Повреждённые «Тигр» и «Фердинанд» остановились перед советскими позициями. Нужно уничтожить их и удержать рубеж.",
        briefing:
          "Перед нами повреждённые «Тигр» и «Фердинанд». Сначала обработай их артиллерией и огнём штаба, затем отправляй Т-34 добивать.",
        victoryDebrief:
          "Обе машины уничтожены, позиция удержана. В награду часть получает СУ-152 «Зверобой».",
        defeatDebrief:
          "Противник прорвал оборону. Отводим уцелевшие части, приводим их в порядок и пробуем снова.",
        botHeadquartersId: "german_9th_army",
        botDeckId: "german_9th_army_campaign",
        playerDeckId: "welcome_kursk_player",
        backgroundId: "russian_1",
        guidedScriptId: "welcome_kursk",
        autoLaunchOnFirstVisit: true,
        skipFirstTurnRoll: true,
        playerCommanderName: "Командир",
        centeredDialogue: true,
        skipResultScreen: true,
        minimalBattleControls: true,
        endRewardId: "welcome_zveroboy",
        // Немцы уже на поле: подбитые Тигр и Фердинанд + свежий средний танк.
        botBoardUnits: [
          { cardId: "tiger_i", position: { row: 0, col: 2 }, hp: 6 },
          { cardId: "ferdinand", position: { row: 1, col: 2 }, hp: 7 },
          { cardId: "pzkpfw_iii_ausf_f", position: { row: 2, col: 3 } },
        ],
        // Две СУ-122 на спавне (верхняя и нижняя клетки), перед верхней — КВ-1;
        // Т-34 на нижней линии. Тыл: гаубица М-30 и два «лекаря» (ГАЗ-55, ПАРМ).
        playerBoardUnits: [
          { cardId: "su_122", position: { row: 0, col: 0 } },
          { cardId: "su_122", position: { row: 2, col: 0 } },
          { cardId: "kv1", position: { row: 0, col: 1 } },
          { cardId: "t34_76", position: { row: 2, col: 1 } },
          { cardId: "gun_m30", zone: "support", supportSlot: 0 },
          { cardId: "gaz_55_ambulance", zone: "support", supportSlot: 1 },
          { cardId: "parm_workshop", zone: "support", supportSlot: 2 },
        ],
      },
    ],
  },

  {
    id: "training-front",
    title: "1. Panzer Div.",
    description:
      "Польша, сентябрь 1939 года. Четыре боя 1-й танковой дивизии — от прорыва границы до подступов к Варшаве.",
    playerHeadquartersId: "first_panzer_division",
    playerDeckId: "first_panzer_division_campaign",
    menuArtUrl: "/ui/menu/campaign-1-panzer-div.webp",
    missions: [
      {
        id: "training-front-1",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Прорыв польской границы у Розпши",
        description:
          "1–3 сентября 1939 года. Дивизия прорывает польские укрепления у Розпши и выходит к реке Варта. На пути стоят части 7-й пехотной дивизии и кавалерия.",
        botHeadquartersId: "polish_border_guard",
        botDeckId: "polish_border_guard_campaign",
        playerDeckId: "first_panzer_m1",
        backgroundId: "base_1",
        illustrationId: "panzer_div1_m1",
      },
      {
        id: "training-front-2",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Бои за Радом",
        description:
          "5–8 сентября 1939 года. Немецкие части замыкают окружение вокруг армии «Прусы». У Радома обороняются польская пехота и остатки кавалерии.",
        botHeadquartersId: "polish_army_lodz",
        botDeckId: "polish_army_lodz_campaign",
        playerDeckId: "first_panzer_m2",
        backgroundId: "german_1",
        illustrationId: "panzer_div1_m2",
      },
      {
        id: "training-front-3",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Битва на Бзуре",
        description:
          "16–20 сентября 1939 года. После переправы через Бзуру дивизия вступает в бой с частями польской армии «Поможе».",
        botHeadquartersId: "polish_army_prusy",
        botDeckId: "polish_army_prusy_campaign",
        playerDeckId: "first_panzer_m3",
        backgroundId: "german_city",
        illustrationId: "panzer_div1_m3",
      },
      {
        id: "training-front-4",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Наступление на окраины Варшавы",
        description:
          "20–28 сентября 1939 года. Дивизия выходит к окраинам Варшавы и поддерживает наступление 18-й пехотной дивизии.",
        botHeadquartersId: "polish_warsaw_defense",
        botDeckId: "polish_warsaw_defense_campaign",
        playerDeckId: "first_panzer_m4",
        backgroundId: "german_city",
        illustrationId: "panzer_div1_m4",
      },
      {
        id: "training-front-5",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Марш через Арденны",
        description:
          "10–12 мая 1940 года. Колонны идут через Арденны к Маасу, преодолевая сопротивление бельгийских егерей и французских передовых частей.",
        available: false,
      },
      {
        id: "training-front-6",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Штурм Седана",
        description:
          "13–14 мая 1940 года. После переправы через Маас дивизия атакует позиции 55-й французской пехотной дивизии на высотах Ла-Марфе.",
        available: false,
      },
      {
        id: "training-front-7",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Рывок к Ла-Маншу",
        description:
          "15–20 мая 1940 года. Танковые части движутся к Ла-Маншу, стараясь отрезать союзные войска в Бельгии от основных сил во Франции.",
        available: false,
      },
      {
        id: "training-front-8",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Бои у Дюнкерка",
        description:
          "25–31 мая 1940 года. У Дюнкерка британские и французские части удерживают коридор, по которому идёт эвакуация.",
        available: false,
      },
      {
        id: "training-front-9",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Прорыв линии Вейгана",
        description:
          "5–10 июня 1940 года. Дивизия атакует новую французскую линию обороны, занятую пехотными и колониальными частями.",
        available: false,
      },
      {
        id: "training-front-10",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Захват Бельфора",
        description:
          "17–22 июня 1940 года. У Бельфора немецкие части окружают французские войска, отходящие к укреплениям линии Мажино.",
        available: false,
      },
      {
        id: "training-front-11",
        chapter: "Восточный фронт 1941–1942",
        title: "Переход границы СССР",
        description:
          "22 июня 1941 года, Литва. В первый день операции «Барбаросса» дивизия сталкивается с советскими пограничными частями и танками 5-й дивизии.",
        available: false,
      },
      {
        id: "training-front-12",
        chapter: "Восточный фронт 1941–1942",
        title: "Бои у Даугавпилса и Пскова",
        description:
          "Июль 1941 года. Бои идут за переправы у Даугавпилса и Пскова, на пути к Луге.",
        available: false,
      },
      {
        id: "training-front-13",
        chapter: "Восточный фронт 1941–1942",
        title: "Наступление на Ленинград",
        description:
          "Август–сентябрь 1941 года. Дивизия пытается пройти через оборону у Луги и продолжить наступление на Ленинград.",
        available: false,
      },
      {
        id: "training-front-14",
        chapter: "Восточный фронт 1941–1942",
        title: "Бои под Москвой",
        description:
          "Октябрь–декабрь 1941 года. На подступах к Москве дивизия встречает свежие части 16-й и 20-й советских армий.",
        available: false,
      },
      {
        id: "training-front-15",
        chapter: "Восточный фронт 1941–1942",
        title: "Оборона Ржевского выступа",
        description:
          "Январь–март 1942 года. После тяжёлых потерь дивизия удерживает Ржевский выступ под ударами 29-й и 39-й советских армий.",
        available: false,
      },
      {
        id: "training-front-16",
        chapter: "Южный сектор 1943–1945",
        title: "Контратаки западнее Киева",
        description:
          "Ноябрь–декабрь 1943 года. После переброски из Греции дивизия контратакует западнее Киева и пытается остановить 1-ю советскую танковую армию.",
        available: false,
      },
      {
        id: "training-front-17",
        chapter: "Южный сектор 1943–1945",
        title: "Деблокирование Корсунь-Черкасского котла",
        description:
          "Январь–февраль 1944 года. Дивизия пытается пробиться к войскам, окружённым под Корсунем, через позиции 5-й гвардейской танковой армии.",
        available: false,
      },
      {
        id: "training-front-18",
        chapter: "Южный сектор 1943–1945",
        title: "Выход из котла Хубе",
        description:
          "Март 1944 года. В Западной Украине дивизия вместе с 1-й танковой армией пробивается из окружения.",
        available: false,
      },
      {
        id: "training-front-19",
        chapter: "Южный сектор 1943–1945",
        title: "Бои за Будапешт",
        description:
          "Октябрь 1944 — январь 1945 года. После боёв у Дебрецена дивизия участвует в попытках деблокировать Будапешт.",
        available: false,
      },
      {
        id: "training-front-20",
        chapter: "Южный сектор 1943–1945",
        title: "Последние бои у Балатона",
        description:
          "Март–май 1945 года. После боёв у Балатона остатки дивизии отходят в Австрию под давлением советских войск.",
        available: false,
      },
    ],
  },

  {
    id: "lavrinenko-ace",
    title: "Танковый ас. Лавриненко",
    description:
      "Осень 1941 года. История Дмитрия Лавриненко и 4-й танковой бригады: бои под Мценском, оборона Волоколамска и контрнаступление под Москвой.",
    playerHeadquartersId: "lavrinenko_tank_brigade",
    playerDeckId: "lavrinenko_brigade_campaign",
    menuArtUrl: "/ui/menu/lavrinenko_company.webp",
    briefingAvatarId: "lavrinenko_tank_brigade_2",
    briefingSpeaker: "Лавриненко",
    missions: [
      {
        id: "lavrinenko-1",
        chapter: "Донбасс 1941 · Формирование",
        title: "Боевое крещение у Сталино",
        description: "Сентябрь 1941 года. Только что сформированная 4-я танковая бригада принимает первый бой под Сталино.",
        briefing:
          "Бригада только сформирована, для многих экипажей это первый бой. Поставь Т-34 в засаду и не двигай их без необходимости: с подготовленной позиции они наносят втрое больше урона. Против нас разведбат 4-й танковой дивизии.",
        victoryDebrief:
          "Первый бой выигран. Экипажи выдержали атаку и не покинули позиции раньше времени.",
        defeatDebrief:
          "Мы слишком рано вышли из засады. В следующем бою оставь Т-34 на позиции и дождись, пока противник подойдёт ближе.",
        botHeadquartersId: "german_4_panzer",
        botDeckId: "german_4_panzer_campaign",
        playerDeckId: "lavrinenko_brigade_campaign",
        backgroundId: "base_1",
        illustrationId: "lavrinenko_m1",
      },
      {
        id: "lavrinenko-2",
        chapter: "Мценск 1941 · Гудериан",
        title: "Первый Воин: танковая засада",
        description: "4 октября 1941 года, станция Первый Воин. Бригада устраивает засаду на пути немецкой танковой колонны.",
        briefing:
          "Займём позиции у станции Первый Воин. Подпусти немецкие танки ближе и открывай огонь из засады. Не снимай машины с места без необходимости.",
        victoryDebrief:
          "Засада сработала. Наступление противника остановлено, станция осталась за нами.",
        defeatDebrief:
          "Мы раскрыли позиции слишком рано, и противник успел перестроиться. Займём засаду заново и подпустим его ближе.",
        botHeadquartersId: "german_4_panzer",
        botDeckId: "german_panzer_mtsensk_campaign",
        playerDeckId: "lavrinenko_brigade_campaign",
        backgroundId: "russian_1",
        illustrationId: "lavrinenko_m2",
      },
      {
        id: "lavrinenko-3",
        chapter: "Мценск 1941 · Гудериан",
        title: "Бои за Мценск",
        description: "6–11 октября 1941 года. Бригада сдерживает корпус Гудериана, отступая от одной подготовленной позиции к другой.",
        briefing:
          "На нас наступает 24-й корпус Гудериана со штурмовыми орудиями. В открытом бою сил не хватит. Отходи после каждого удара, снова занимай позиции и не позволяй обойти бригаду.",
        victoryDebrief:
          "Корпус Гудериана задержан. Бригада сохранила боеспособность и выиграла время для обороны Москвы.",
        defeatDebrief:
          "Противник обошёл наши позиции и зажал бригаду. Не задерживайся после контрудара: отходи и занимай новую засаду.",
        botHeadquartersId: "guderian_corps",
        botDeckId: "guderian_corps_campaign",
        playerDeckId: "lavrinenko_brigade_campaign",
        backgroundId: "russian_1",
        illustrationId: "lavrinenko_m3",
      },
      {
        id: "lavrinenko-4",
        chapter: "Переброска",
        title: "Марш под Москву",
        description: "Октябрь 1941 года. Во время переброски под Москву бригада встречает немецкий разведывательный отряд.",
        briefing:
          "Бригада направляется под Волоколамск. Дорогу перекрыл немецкий разведдозор. Бой будет коротким: подготовь силы и атакуй, прежде чем противник получит подкрепление.",
        victoryDebrief:
          "Разведдозор уничтожен, путь свободен. Продолжаем движение к Волоколамску.",
        defeatDebrief:
          "Мы потеряли время и позволили дозору закрепиться. В следующей попытке начинай атаку раньше.",
        botHeadquartersId: "german_4_panzer",
        botDeckId: "german_aufklarung_campaign",
        playerDeckId: "lavrinenko_brigade_campaign",
        backgroundId: "german_1",
        illustrationId: "lavrinenko_m4",
      },
      {
        id: "lavrinenko-5",
        chapter: "Волоколамск 1941",
        title: "Контрудар у Скирманово",
        description: "12–13 ноября 1941 года. Советские части атакуют укреплённое село Скирманово.",
        briefing:
          "Сегодня наступаем. Нам приданы лёгкие танки БТ. Используй «Блиц» и входи в Скирманово до того, как немцы подтянут противотанковые орудия.",
        victoryDebrief:
          "Скирманово взято. Быстрая атака не дала противнику развернуть противотанковые орудия.",
        defeatDebrief:
          "Атака задержалась, и противник успел подготовить оборону. Используй скорость БТ и «Блиц» с первых ходов.",
        botHeadquartersId: "german_10_panzer",
        botDeckId: "german_10_panzer_campaign",
        playerHeadquartersId: "soviet_motor_rifle_division",
        playerDeckId: "soviet_motor_rifle_division_default",
        backgroundId: "winter_1",
        illustrationId: "lavrinenko_m5",
      },
      {
        id: "lavrinenko-6",
        chapter: "Волоколамск 1941",
        title: "Одинокий Т-34",
        description: "19 ноября 1941 года, Гусенево. Т-34 Лавриненко атакует немецкую колонну из засады.",
        briefing:
          "У Гусенево идёт немецкая колонна. У нас один Т-34 и подготовленная засада. Подпусти противника и стреляй наверняка: права на ошибку нет.",
        victoryDebrief:
          "Колонна уничтожена, наш танк уцелел. Засада позволила остановить превосходящие силы.",
        defeatDebrief:
          "Колонну остановить не удалось. Повторим атаку: не покидай засаду и выбирай цели по одной.",
        botHeadquartersId: "german_11_panzer",
        botDeckId: "german_11_panzer_campaign",
        playerDeckId: "lavrinenko_ace_campaign",
        backgroundId: "winter_1",
        illustrationId: "lavrinenko_m6",
        // Личный Т-34 аса уже в засаде на спавне; на руки — стандартное число
        // карт, у обеих сторон колоды урезаны до 15 (короткая напряжённая дуэль).
        playerBoardUnits: [
          { cardId: "t34_lavrinenko", position: { row: 2, col: 1 } },
        ],
      },
      {
        id: "lavrinenko-7",
        chapter: "Волоколамск 1941",
        title: "Плечом к плечу с Панфиловым",
        description: "16–20 ноября 1941 года. Танкисты вместе с дивизией Панфилова удерживают рубеж на Волоколамском направлении.",
        briefing:
          "Занимаем оборону вместе с 316-й дивизией Панфилова. Танков мало, поэтому опирайся на противотанковые заслоны. Удержи рубеж и не дай противнику пройти к Москве.",
        victoryDebrief:
          "Рубеж удержан. Наступление противника остановлено ещё на один день.",
        defeatDebrief:
          "Противник занял рубеж. Собираем оставшиеся силы и готовим новую оборону.",
        botHeadquartersId: "guderian_corps",
        botDeckId: "german_moscow_assault_campaign",
        playerHeadquartersId: "panfilov_division",
        playerDeckId: "panfilov_division_campaign",
        backgroundId: "winter_2",
        illustrationId: "lavrinenko_m7",
      },
      {
        id: "lavrinenko-8",
        chapter: "Гвардия",
        title: "Гвардейское знамя",
        description: "22 ноября 1941 года, Лысцево. Первый бой части после преобразования в 1-ю гвардейскую танковую бригаду.",
        briefing:
          "Теперь мы 1-я гвардейская танковая бригада. Танки в засаде получили усиление и могут сразу использовать «Блиц». Против нас полк Großdeutschland — приготовься к тяжёлому бою.",
        victoryDebrief:
          "Полк Großdeutschland отступил. Первый бой в гвардейском составе выигран.",
        defeatDebrief:
          "Первый бой в новом составе проигран. Учтём ошибки и повторим атаку.",
        botHeadquartersId: "grossdeutschland",
        botDeckId: "grossdeutschland_campaign",
        playerHeadquartersId: "first_guards_tank_brigade",
        playerDeckId: "lavrinenko_guards_campaign",
        backgroundId: "winter_2",
        illustrationId: "lavrinenko_m8",
      },
      {
        id: "lavrinenko-9",
        chapter: "Контрнаступление",
        title: "Перелом под Москвой",
        description: "6–10 декабря 1941 года. Советские войска переходят в контрнаступление под Москвой.",
        briefing:
          "Переходим в наступление. У немцев не хватает топлива, часть техники не заводится на морозе. Атакуй сейчас, пока они не восстановили снабжение.",
        victoryDebrief:
          "Противник отступает от Москвы. Контрнаступление продолжается.",
        defeatDebrief:
          "Оборона противника оказалась крепче, чем ожидалось. Восстановим части и возобновим наступление.",
        botHeadquartersId: "german_winter_panzer",
        botDeckId: "german_winter_campaign",
        playerHeadquartersId: "first_guards_tank_brigade",
        playerDeckId: "lavrinenko_guards_campaign",
        backgroundId: "winter_2",
        illustrationId: "lavrinenko_m9",
      },
      {
        id: "lavrinenko-10",
        chapter: "Последний бой",
        title: "Горюны, 18 декабря",
        description: "18 декабря 1941 года, Горюны. Последний бой Дмитрия Лавриненко.",
        briefing:
          "У Горюнов противник выставил противотанковые пушки и штурмовые орудия. Нужно прорвать заслон и открыть дорогу для всей бригады. Я поведу атаку первым.",
        victoryDebrief:
          "Заслон прорван, бригада прошла через Горюны. Поставленная задача выполнена.",
        defeatDebrief:
          "Прорвать заслон не удалось. Перегруппируй силы и сначала уничтожь противотанковые орудия.",
        botHeadquartersId: "winter_blocking_force",
        botDeckId: "winter_blocking_force_campaign",
        playerHeadquartersId: "first_guards_tank_brigade",
        playerDeckId: "lavrinenko_guards_campaign",
        backgroundId: "winter_1",
        illustrationId: "lavrinenko_m10",
        // Последний бой аса: его личный Т-34 уже на спавне, как и в Гусенево.
        playerBoardUnits: [
          { cardId: "t34_lavrinenko", position: { row: 2, col: 1 } },
        ],
      },
    ],
  },

  {
    id: "raseiniai-kv",
    title: "Одинокий КВ",
    description:
      "Литва, июнь 1941 года. После боёв 2-й танковой дивизии под Расейняем один КВ остаётся на дороге и задерживает снабжение немецкой боевой группы.",
    playerHeadquartersId: "soviet_2nd_tank_division",
    playerDeckId: "soviet_2nd_td_campaign",
    menuArtUrl: "/ui/menu/raseiniai_kv.webp",
    briefingAvatarId: "kv_crew",
    briefingSpeaker: "Командир КВ",
    missions: [
      {
        id: "raseiniai-1",
        chapter: "Литва 1941 · Приграничное сражение",
        title: "Граница в огне",
        description:
          "22 июня 1941 года. Поднятая по тревоге дивизия выдвигается к Расейняю и встречает на дороге немецкий разведывательный отряд.",
        briefing:
          "Дивизия выдвигается к Расейняю. На дороге замечена немецкая разведка: броневики и мотоциклы. Поставь КВ впереди, а лёгкими машинами прикрой фланги.",
        victoryDebrief:
          "Разведывательный отряд уничтожен, дорога свободна. Главные силы противника уже переправляются через Дубису.",
        defeatDebrief:
          "Немецкая разведка задержала дивизию на марше. При повторной попытке держи КВ впереди и не оставляй фланги открытыми.",
        botHeadquartersId: "first_panzer_division",
        botDeckId: "first_panzer_border_campaign",
        playerDeckId: "soviet_2nd_td_campaign",
        backgroundId: "base_1",
        illustrationId: "raseiniai_m1",
        // Дивизия уже развёрнута: КВ-1 на спавне, два расчёта 45-мм 53-К в тылу.
        playerBoardUnits: [
          { cardId: "kv1", position: { row: 1, col: 0 } },
          { cardId: "gun_53k", zone: "support", supportSlot: 0 },
          { cardId: "gun_53k", zone: "support", supportSlot: 1 },
        ],
      },
      {
        id: "raseiniai-2",
        chapter: "Литва 1941 · Приграничное сражение",
        title: "Стальной таран у Скаудвиле",
        description:
          "23 июня 1941 года. 2-я танковая дивизия контратакует группу Зекендорфа у Скаудвиле. Немецким 37-мм пушкам трудно пробить броню КВ.",
        briefing:
          "Перед нами 6-я танковая дивизия: Pz 35(t) и 37-мм противотанковые пушки. В лоб они почти не пробивают КВ. Наступай тяжёлыми танками, но не оставляй их без прикрытия.",
        victoryDebrief:
          "Группа Зекендорфа отступила. Топливо и боеприпасы заканчиваются, поэтому дивизия начинает отход. Один КВ остаётся на дороге.",
        defeatDebrief:
          "КВ оказались без поддержки и попали под сосредоточенный огонь. В следующей атаке прикрой тяжёлые танки.",
        botHeadquartersId: "german_6_panzer",
        botDeckId: "german_6_panzer_campaign",
        playerDeckId: "soviet_2nd_td_campaign",
        backgroundId: "russian_1",
        illustrationId: "raseiniai_m2",
        // Остриё контрудара уже развёрнуто: КВ-2 стоит на спавне.
        playerBoardUnits: [
          { cardId: "kv2", position: { row: 1, col: 0 } },
        ],
      },
      {
        id: "raseiniai-3",
        chapter: "Расейняй · Один против дивизии",
        title: "Перекрёсток",
        description:
          "24 июня 1941 года. Один КВ занимает дорогу между Расейняем и Дубисой, по которой снабжается боевая группа Рауса.",
        briefing:
          "Один КВ остаётся на перекрёстке. Машина исправна, боекомплект полный. Сначала уничтожай грузовики снабжения, затем займись противотанковыми пушками.",
        victoryDebrief:
          "Колонна снабжения и батарея Pak 38 уничтожены. Группа Рауса осталась без топлива и боеприпасов, дорога перекрыта.",
        defeatDebrief:
          "Часть колонны прошла через перекрёсток. Займи позицию снова и в первую очередь бей по грузовикам.",
        botHeadquartersId: "german_6_panzer",
        botDeckId: "raus_supply_campaign",
        playerHeadquartersId: "soviet_2nd_tank_division",
        playerDeckId: "kv_crew_ba10_campaign",
        backgroundId: "base_1",
        illustrationId: "raseiniai_m3",
        playerBoardUnits: [
          { cardId: "kv1_raseiniai", position: { row: 1, col: 2 } },
        ],
      },
      {
        id: "raseiniai-4",
        chapter: "Расейняй · Один против дивизии",
        title: "Ночь сапёров",
        description:
          "Ночь на 25 июня 1941 года. Немецкие сапёры пытаются подобраться к неподвижному КВ с подрывными зарядами.",
        briefing:
          "Ночью немцы отправят сапёров с зарядами под прикрытием пехотных пушек. Не покидай позицию и уничтожай сапёров до того, как они подойдут к танку.",
        victoryDebrief:
          "Ночная атака отбита. Танк повреждён, но экипаж сохранил машину и удержал перекрёсток.",
        defeatDebrief:
          "Сапёры успели добраться до танка. При повторной попытке уничтожай их в первую очередь.",
        botHeadquartersId: "german_6_panzer",
        botDeckId: "raus_pioneers_campaign",
        playerHeadquartersId: "soviet_2nd_tank_division",
        playerDeckId: "kv_crew_ba10_campaign",
        backgroundId: "german_1",
        illustrationId: "raseiniai_m4",
        playerBoardUnits: [
          { cardId: "kv1_raseiniai", position: { row: 1, col: 2 } },
        ],
      },
      {
        id: "raseiniai-5",
        chapter: "Расейняй · Один против дивизии",
        title: "Восемь-восемь",
        description:
          "25 июня 1941 года. Пока Pz 35(t) отвлекают экипаж КВ, немцы выводят на позицию 88-мм зенитное орудие.",
        briefing:
          "Немецкие танки отвлекают нас, пока в тылу разворачивают 88-мм орудие. Оно способно пробить КВ. Найди и уничтожь пушку как можно раньше.",
        victoryDebrief:
          "Один КВ задержал немецкую дивизию почти на двое суток. Экипаж выполнил задачу до конца.",
        defeatDebrief:
          "88-мм орудие успело открыть огонь. В следующей попытке найди его раньше и сделай главной целью.",
        botHeadquartersId: "german_6_panzer",
        botDeckId: "raus_flak88_campaign",
        playerHeadquartersId: "soviet_2nd_tank_division",
        playerDeckId: "kv_crew_campaign",
        backgroundId: "russian_1",
        illustrationId: "raseiniai_m5",
        playerBoardUnits: [
          { cardId: "kv1_raseiniai", position: { row: 1, col: 1 } },
        ],
      },
    ],
  },

  {
    id: "first-panthers",
    title: "Первые Пантеры",
    description:
      "1942–1943 годы. От испытаний первых прототипов до боёв под Курском. Новая «Пантера» получила мощную пушку и хорошую лобовую броню, но часто страдала от пожаров и поломок.",
    playerHeadquartersId: "german_panther_regiment",
    playerDeckId: "panther_kummersdorf_deck",
    menuArtUrl: "/ui/menu/first_panthers.webp",
    briefingAvatarId: "german_panther_regiment",
    briefingSpeaker: "Инспектор танковых войск",
    premium: true,
    goldCost: 1499,
    missions: [
      // ——— Глава I. Полигон Куммерсдорф ———
      {
        id: "panther-1",
        chapter: "Полигон Куммерсдорф · 1942",
        title: "Трофей с востока",
        description:
          "Полигон Куммерсдорф, 1942 год. Прототип Daimler-Benz испытывают в бою против трофейного Т-34. Короткоствольная 75-мм пушка не пробивает его лобовую броню.",
        briefing:
          "Испытываем прототип VK 30.01 против трофейного Т-34. Его наклонную броню трудно пробить в лоб, поэтому заходите во фланг. Двигатель прототипа ненадёжен — избегайте лишних перемещений.",
        victoryDebrief:
          "Т-34 удалось подбить только с борта. Комиссия признала короткоствольную пушку недостаточной и потребовала установить длинноствольную.",
        defeatDebrief:
          "Испытание провалено: лобовая броня Т-34 выдержала обстрел, а двигатель прототипа отказал. Повторите заезд и атакуйте с фланга.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_kummersdorf_m1_deck",
        backgroundId: "base_1",
        illustrationId: "panther_m1",
        playerBoardUnits: [
          { cardId: "vk3001_db", position: { row: 1, col: 0 } },
          { cardId: "vk3001_db", position: { row: 2, col: 0 } },
        ],
        botBoardUnits: [
          { cardId: "t34_beute", position: { row: 0, col: 4 } },
          { cardId: "t34_beute", position: { row: 2, col: 4 } },
        ],
      },
      {
        id: "panther-2",
        chapter: "Полигон Куммерсдорф · 1942",
        title: "Наклонная броня",
        description:
          "На полигоне сравнивают защиту прототипа и трофейного Т-34. Наклонная броня советского танка лучше выдерживает попадания.",
        briefing:
          "Трофейные Т-34 заняли подготовленные позиции. Выманите их из укрытий и атакуйте с фланга. Не подставляйте борта своих машин.",
        victoryDebrief:
          "Подготовленные позиции взяты. Комиссия включила наклонную лобовую броню и длинноствольную пушку в требования к новой машине.",
        defeatDebrief:
          "Лобовая атака не удалась. В следующем заезде заставьте Т-34 покинуть позиции и заходите сбоку.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_kummersdorf_deck",
        backgroundId: "base_1",
        illustrationId: "panther_m2",
        playerBoardUnits: [
          { cardId: "vk3001_db", position: { row: 1, col: 0 } },
          { cardId: "vk3001_db", position: { row: 2, col: 0 } },
        ],
        botBoardUnits: [
          { cardId: "t34_beute", position: { row: 0, col: 4 } },
          { cardId: "t34_beute", position: { row: 1, col: 4 } },
          { cardId: "t34_beute", position: { row: 2, col: 4 } },
        ],
      },
      {
        id: "panther-3",
        chapter: "Полигон Куммерсдорф · 1942",
        title: "Глохнет на дистанции",
        description:
          "Во время длительного заезда двигатель прототипа перегревается, а машина теряет ход. Нужно завершить испытание и не допустить лишних поломок.",
        briefing:
          "Сегодня проверяем прототип длительным маршем. При каждом перемещении двигатель может перегреться: с вероятностью 70% машина потеряет 1 единицу здоровья. Передвигайтесь только тогда, когда это необходимо.",
        victoryDebrief:
          "Марш завершён, но перегрев подтвердился. В отчёте потребуем переделать двигатель. Для следующих испытаний выделен прототип MAN.",
        defeatDebrief:
          "Машины остановились из-за перегрева. Повторите марш и сократите количество перемещений.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_kummersdorf_deck",
        backgroundId: "base_1",
        illustrationId: "panther_m3",
        playerBoardUnits: [
          { cardId: "vk3001_db", position: { row: 1, col: 0 } },
        ],
      },

      // ——— Глава II. Формирование Pz.Abt.51/52 ———
      {
        id: "panther-4",
        chapter: "Формирование Pz.Abt. 51/52 · 1943",
        title: "Длинный ствол",
        description:
          "Прототип MAN получил длинноствольную 75-мм пушку KwK 42 L/70. Теперь он может поражать Т-34 в лоб с большой дистанции.",
        briefing:
          "VK 30.02 получил длинноствольную пушку, способную пробивать Т-34 в лоб. Держите дистанцию и не подставляйте борта.",
        victoryDebrief:
          "Новая пушка показала нужную бронепробиваемость. Теперь предстоит устранить остальные недостатки машины.",
        defeatDebrief:
          "Преимущество новой пушки потеряно в ближнем бою. Держите противника на дистанции и встречайте его лобовой бронёй.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_forming_m4_deck",
        backgroundId: "base_1",
        illustrationId: "panther_m4",
        playerBoardUnits: [
          { cardId: "vk3002_man", position: { row: 1, col: 0 } },
        ],
      },
      {
        id: "panther-5",
        chapter: "Формирование Pz.Abt. 51/52 · 1943",
        title: "Ремонтная летучка",
        description:
          "Первые серийные Panther Ausf. D часто выходят из строя ещё на марше. Бергепантера помогает ремонтировать повреждённые машины прямо на позиции.",
        briefing:
          "Двигатели серийных «Пантер» всё ещё перегреваются при движении. Бергепантера в начале хода восстанавливает 1 единицу здоровья соседним машинам, а рядом со штабом ремонтирует и его. Держите ремонтную машину поблизости и не перемещайте танки без необходимости.",
        victoryDebrief:
          "Позиции заняты. Бергепантера помогла сохранить неисправные машины в строю.",
        defeatDebrief:
          "Машины были потеряны по одной из-за перегрева и повреждений. Держите их рядом с Бергепантерой и сократите лишние перемещения.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_forming_deck",
        backgroundId: "german_1",
        illustrationId: "panther_m5",
        playerBoardUnits: [
          { cardId: "panther_d", position: { row: 0, col: 0 }, hp: 3 },
          { cardId: "panther_d", position: { row: 2, col: 0 }, hp: 2 },
          { cardId: "bergepanther", position: { row: 1, col: 0 } },
        ],
        botBoardUnits: [
          { cardId: "t34_beute", position: { row: 0, col: 4 } },
          { cardId: "t34_beute", position: { row: 1, col: 4 } },
          { cardId: "t34_beute", position: { row: 2, col: 4 } },
        ],
      },
      {
        id: "panther-6",
        chapter: "Формирование Pz.Abt. 51/52 · 1943",
        title: "Финальный привод",
        description:
          "Бортовые передачи не выдерживают веса танка. Несколько «Пантер» начинают испытание без хода, и их нужно вернуть в строй с помощью Бергепантеры.",
        briefing:
          "Бортовые передачи не выдерживают веса машины. Обездвиженная «Пантера» может стрелять, но не сможет двигаться до ремонта Бергепантерой. Прикрывайте остановившиеся танки.",
        victoryDebrief:
          "Все остановившиеся машины эвакуированы. Испытание подтвердило ненадёжность бортовых передач.",
        defeatDebrief:
          "Неподвижные танки остались без прикрытия и были уничтожены. Подводите Бергепантеру сразу после поломки.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_forming_deck",
        backgroundId: "german_1",
        illustrationId: "panther_m6",
        playerBoardUnits: [
          { cardId: "panther_d", position: { row: 1, col: 0 }, hp: 2, status: { immobilized: true } },
          { cardId: "panther_d", position: { row: 2, col: 0 }, hp: 2, status: { immobilized: true } },
          { cardId: "bergepanther", position: { row: 1, col: 1 } },
        ],
        botBoardUnits: [
          { cardId: "t34_beute", position: { row: 0, col: 4 } },
          { cardId: "t34_beute", position: { row: 2, col: 4 } },
        ],
      },
      {
        id: "panther-7",
        chapter: "Формирование Pz.Abt. 51/52 · 1943",
        title: "Смотр перед фронтом",
        description:
          "Перед отправкой на фронт взвод «Пантер» проходит последнее испытание. Комиссия требует провести машины без потерь от пожаров и поломок.",
        briefing:
          "Комиссия ждёт подтверждения готовности «Пантер». Проведите взвод через испытание без потерь: следите за перегревом и держите Бергепантеру рядом.",
        victoryDebrief:
          "Испытание пройдено. Комиссия разрешила отправить «Пантеры» на фронт под Курск.",
        defeatDebrief:
          "Испытание не пройдено: комиссия зафиксировала потери машин. Повторите заезд и внимательнее следите за ремонтом.",
        botHeadquartersId: "german_kummersdorf",
        botDeckId: "kummersdorf_campaign",
        playerDeckId: "panther_forming_deck",
        backgroundId: "base_1",
        illustrationId: "panther_m7",
        playerBoardUnits: [
          { cardId: "panther_d", position: { row: 1, col: 0 } },
          { cardId: "bergepanther", position: { row: 2, col: 0 } },
        ],
      },

      // ——— Глава III. Цитадель — дебют под Курском ———
      {
        id: "panther-8",
        chapter: "Цитадель · Курск, июль 1943",
        title: "Марш к фронту",
        description:
          "4–5 июля 1943 года. Pz.-Rgt. 39 выдвигается к передовой. Часть «Пантер» ломается и загорается ещё до вступления в бой.",
        briefing:
          "Полк ещё не вступил в бой, но часть машин уже остановилась из-за пожаров и поломок. Эвакуируйте их Бергепантерами, ремонтируйте на ходу и сохраняйте строй.",
        victoryDebrief:
          "Уцелевшие машины дошли до передовой, но боеспособна лишь часть роты. Впереди советская оборона.",
        defeatDebrief:
          "Большинство машин потеряно ещё на марше. Повторите выдвижение и раньше отправляйте Бергепантеры к неисправным танкам.",
        botHeadquartersId: "soviet_central_front",
        botDeckId: "soviet_kursk_defense_full_deck",
        playerDeckId: "panther_regiment_m8_deck",
        backgroundId: "russian_1",
        illustrationId: "panther_m8",
        playerBoardUnits: [
          { cardId: "panther_d", position: { row: 1, col: 0 } },
          { cardId: "bergepanther", position: { row: 2, col: 0 } },
        ],
        botBoardUnits: [
          { cardId: "kv1", position: { row: 0, col: 4 } },
          { cardId: "su_122", position: { row: 2, col: 4 } },
          // Тыловая линия обороны забита 45-мм противотанковыми пушками.
          { cardId: "gun_53k", zone: "support", supportSlot: 0 },
          { cardId: "gun_53k", zone: "support", supportSlot: 1 },
          { cardId: "gun_53k", zone: "support", supportSlot: 2 },
          { cardId: "gun_53k", zone: "support", supportSlot: 3 },
        ],
      },
      {
        id: "panther-9",
        chapter: "Цитадель · Курск, июль 1943",
        title: "Обоянское шоссе",
        description:
          "На Обоянском шоссе «Пантеры» встречают танки 1-й советской танковой армии. На дальней дистанции у немцев преимущество, но в ближнем бою уязвимы борта.",
        briefing:
          "На Обоянском шоссе дальность на нашей стороне. Уничтожайте Т-34 до их сближения и не позволяйте им выйти во фланг.",
        victoryDebrief:
          "Участок шоссе занят, советские танки отступили. Наши потери и износ машин остаются высокими.",
        defeatDebrief:
          "Т-34 подошли слишком близко и поразили машины в борт. Не позволяйте им сокращать дистанцию.",
        botHeadquartersId: "soviet_central_front",
        botDeckId: "soviet_kursk_defense_m9_deck",
        playerDeckId: "panther_regiment_m8_deck",
        backgroundId: "russian_1",
        illustrationId: "panther_m9",
        playerBoardUnits: [
          { cardId: "panther_d", position: { row: 1, col: 0 } },
        ],
        botBoardUnits: [
          { cardId: "t34_76", position: { row: 0, col: 4 } },
          { cardId: "t34_76", position: { row: 2, col: 4 } },
        ],
      },
      {
        id: "panther-10",
        chapter: "Цитадель · Курск, июль 1943",
        title: "Минные поля",
        description:
          "Советские минные поля прикрыты противотанковой артиллерией. Подорванные «Пантеры» теряют ход и остаются под огнём.",
        briefing:
          "Впереди минные поля под прикрытием противотанковых орудий. Подорванные «Пантеры» сохраняют возможность вести огонь. Прикрывайте ими сектор, пока Бергепантеры занимаются эвакуацией.",
        victoryDebrief:
          "Минное поле пройдено, подорванные машины не позволили противнику контратаковать.",
        defeatDebrief:
          "Подорванные танки остались без поддержки и были уничтожены. Сохраняйте строй и прикрывайте эвакуацию.",
        botHeadquartersId: "soviet_central_front",
        botDeckId: "soviet_kursk_defense_full_deck",
        playerDeckId: "panther_regiment_m10_deck",
        backgroundId: "russian_1",
        illustrationId: "panther_m10",
        // Игрок всегда ходит первым (без броска за первый ход).
        skipFirstTurnRoll: true,
        playerBoardUnits: [
          // Подорванные «Пантеры» застряли на минном поле в центре (средний столбец).
          { cardId: "panther_d", position: { row: 0, col: 2 }, hp: 3 },
          { cardId: "panther_d", position: { row: 2, col: 2 }, hp: 3 },
          // Плацдарм игрока: ремонтная летучка.
          { cardId: "bergepanther", position: { row: 1, col: 0 } },
        ],
        botBoardUnits: [
          // Плацдарм противника держат КВ-1.
          { cardId: "kv1", position: { row: 0, col: 4 } },
          { cardId: "kv1", position: { row: 2, col: 4 } },
          // Вся тыловая линия обороны забита 45-мм противотанковыми пушками.
          { cardId: "gun_53k", zone: "support", supportSlot: 0 },
          { cardId: "gun_53k", zone: "support", supportSlot: 1 },
          { cardId: "gun_53k", zone: "support", supportSlot: 2 },
          { cardId: "gun_53k", zone: "support", supportSlot: 3 },
        ],
      },
      {
        id: "panther-11",
        chapter: "Цитадель · Курск, июль 1943",
        title: "Поныри",
        description:
          "У Понырей «Пантеры» встречают плотную противотанковую оборону и тяжёлые СУ-152. Советские части стараются выйти во фланг и бить по бортам.",
        briefing:
          "У Понырей действуют СУ-152. Их орудия опасны даже для лобовой брони «Пантер». Не подставляйте борта и уничтожайте тяжёлые САУ в первую очередь.",
        victoryDebrief:
          "Позиция занята, СУ-152 уничтожены. Полк понёс тяжёлые потери, наступление замедлилось.",
        defeatDebrief:
          "СУ-152 вышли во фланг и уничтожили наши машины. При повторной атаке сделайте их главной целью.",
        botHeadquartersId: "soviet_central_front",
        botDeckId: "soviet_kursk_defense_full_deck",
        playerDeckId: "panther_regiment_m10_deck",
        backgroundId: "russian_1",
        illustrationId: "panther_m11",
        // Первый ход за противником: «Зверобои» открывают огонь первыми.
        botStartsFirst: true,
        playerBoardUnits: [
          // Две «Пантеры» на плацдарме игрока.
          { cardId: "panther_d", position: { row: 0, col: 0 } },
          { cardId: "panther_d", position: { row: 2, col: 0 } },
        ],
        botBoardUnits: [
          // Два «Зверобоя» СУ-152 в столбце перед вражеским спавном (col 3).
          { cardId: "su_152", position: { row: 0, col: 3 } },
          { cardId: "su_152", position: { row: 2, col: 3 } },
          // Тыловая линия обороны: два 45-мм ПТО и гаубица М-30.
          { cardId: "gun_53k", zone: "support", supportSlot: 0 },
          { cardId: "gun_53k", zone: "support", supportSlot: 1 },
          { cardId: "gun_m30", zone: "support", supportSlot: 2 },
        ],
      },
      {
        id: "panther-12",
        chapter: "Цитадель · Курск, июль 1943",
        title: "Последняя машина",
        description:
          "Повреждённая «Пантера № 534» осталась позади полка. Прорвитесь к машине, прикройте ремонтную группу и выведите танк из боя.",
        briefing:
          "«Пантера № 534» потеряла ход, но её орудие ещё исправно. Экипаж отказался бросать машину. Подведите Бергепантеру, восстановите ходовую и выведите танк к нашему штабу.",
        victoryDebrief:
          "Ремонтники восстановили ходовую, и «Пантера № 534» покинула позицию. После полевого усиления машина вернётся в строй.",
        defeatDebrief:
          "«Пантера № 534» потеряна. При следующей попытке быстрее подведите Бергепантеру и прикройте повреждённую машину.",
        botHeadquartersId: "soviet_central_front",
        botDeckId: "soviet_kursk_defense_m12_deck",
        playerDeckId: "panther_regiment_m12_deck",
        backgroundId: "russian_1",
        illustrationId: "panther_m12",
        skipFirstTurnRoll: true,
        playerStartingHandCardIds: ["stug_iii", "pak38", "sdkfz_251"],
        objective: {
          type: "evacuate_unit",
          ownerId: "player",
          unitTag: "panther-534",
          label: { ru: "«Пантера № 534»", en: "Panther No. 534" },
          evacuationColumn: 0,
          requireOperational: true,
          requireFullHealth: true,
          loseIfDestroyed: true,
        },
        playerBoardUnits: [
          {
            cardId: "panther_d",
            scenarioTag: "panther-534",
            position: { row: 1, col: 2 },
            hp: 3,
            status: {
              immobilized: true,
              immobilizedUntilFullyRepaired: true,
            },
          },
          { cardId: "bergepanther", position: { row: 2, col: 0 } },
        ],
        botBoardUnits: [
          { cardId: "su76", position: { row: 0, col: 4 } },
          { cardId: "su76", position: { row: 2, col: 4 } },
        ],
      },
    ],
  },
];

/**
 * Cards granted for completing a fixed set of campaign missions. Shared between
 * the client (which detects completion and requests the claim) and the server
 * (which actually grants the copies and guards against double-claiming). The
 * grant is idempotent server-side, keyed by the reward `id`.
 */
export type CampaignCompletionReward = {
  id: string;
  /** Every listed mission must be completed before the reward unlocks. */
  missionIds: string[];
  cardId: string;
  copies: number;
};

export const CAMPAIGN_COMPLETION_REWARDS: CampaignCompletionReward[] = [
  // Миссия-трейлер: за удержание рубежа у Понырей — легендарный «Зверобой»
  // СУ-152. Штаб Центрального фронта остается только сценарным штабом миссии.
  {
    id: "welcome_zveroboy",
    missionIds: ["welcome-kursk-1"],
    cardId: "su_152",
    copies: 1,
  },
  {
    id: "first_panzer_poland",
    missionIds: [
      "training-front-1",
      "training-front-2",
      "training-front-3",
      "training-front-4",
    ],
    cardId: "pzbef_i",
    copies: 2,
  },
  // Кампания «Лавриненко»: за взятие Мценска — рабочая лошадка аса.
  {
    id: "lavrinenko_mtsensk",
    missionIds: ["lavrinenko-1", "lavrinenko-2", "lavrinenko-3"],
    cardId: "t34_1941",
    copies: 2,
  },
  // За удержание Волоколамского рубежа — мощная ПТ-САУ для засад.
  {
    id: "lavrinenko_volokolamsk",
    missionIds: [
      "lavrinenko-1",
      "lavrinenko-2",
      "lavrinenko-3",
      "lavrinenko-4",
      "lavrinenko-5",
      "lavrinenko-6",
      "lavrinenko-7",
    ],
    cardId: "zis_30",
    copies: 2,
  },
  // За прохождение всей кампании — легендарный личный Т-34 аса (уникум).
  {
    id: "lavrinenko_ace",
    missionIds: [
      "lavrinenko-1",
      "lavrinenko-2",
      "lavrinenko-3",
      "lavrinenko-4",
      "lavrinenko-5",
      "lavrinenko-6",
      "lavrinenko-7",
      "lavrinenko-8",
      "lavrinenko-9",
      "lavrinenko-10",
    ],
    cardId: "t34_lavrinenko",
    copies: 1,
  },
  // Кампания «Одинокий КВ»: за контрудар у Скаудвиле — КВ-2 в коллекцию.
  {
    id: "raseiniai_skaudvile",
    missionIds: ["raseiniai-1", "raseiniai-2"],
    cardId: "kv2",
    copies: 1,
  },
  // За всю кампанию — уникальный экранированный КВ-1Э.
  {
    id: "raseiniai_lone_kv",
    missionIds: [
      "raseiniai-1",
      "raseiniai-2",
      "raseiniai-3",
      "raseiniai-4",
      "raseiniai-5",
    ],
    cardId: "kv1_raseiniai",
    copies: 1,
  },

  // Кампания «Первые Пантеры»: наградная лесенка прототипов.
  // За первые три миссии — прототип Daimler-Benz VK 30.01 (D).
  {
    id: "first_panthers_db",
    missionIds: ["panther-1", "panther-2", "panther-3"],
    cardId: "vk3001_db",
    copies: 2,
  },
  // За первые шесть миссий — победивший прототип MAN VK 30.02 (M).
  {
    id: "first_panthers_man",
    missionIds: [
      "panther-1",
      "panther-2",
      "panther-3",
      "panther-4",
      "panther-5",
      "panther-6",
    ],
    cardId: "vk3002_man",
    copies: 2,
  },
  // За прорыв под Курском (до Понырей) — серийная Panther Ausf. D.
  {
    id: "first_panthers_panther_d",
    missionIds: [
      "panther-1",
      "panther-2",
      "panther-3",
      "panther-4",
      "panther-5",
      "panther-6",
      "panther-7",
      "panther-8",
      "panther-9",
      "panther-10",
    ],
    cardId: "panther_d",
    copies: 2,
  },
  // За всю кампанию — уникум Panther «534» полевой доработки (без перегрева).
  {
    id: "first_panthers_ace",
    missionIds: [
      "panther-1",
      "panther-2",
      "panther-3",
      "panther-4",
      "panther-5",
      "panther-6",
      "panther-7",
      "panther-8",
      "panther-9",
      "panther-10",
      "panther-11",
      "panther-12",
    ],
    cardId: "panther_534",
    copies: 1,
  },
];

export function getCampaignCompletionReward(
  rewardId: string
): CampaignCompletionReward | null {
  return (
    CAMPAIGN_COMPLETION_REWARDS.find((reward) => reward.id === rewardId) ?? null
  );
}

/** Stable id used to mark a campaign reward as claimed in the player profile. */
export function getCampaignRewardClaimKey(rewardId: string): string {
  return `campaign-reward:${rewardId}`;
}

export function isCampaignRewardClaimed(
  claimedRewardIds: string[],
  rewardId: string
): boolean {
  return claimedRewardIds.includes(getCampaignRewardClaimKey(rewardId));
}

/** Campaign-completion rewards that belong to (are earned within) a campaign. */
export function getCampaignCompletionRewardsForCampaign(
  campaign: Campaign
): CampaignCompletionReward[] {
  const missionIds = new Set(campaign.missions.map((mission) => mission.id));

  return CAMPAIGN_COMPLETION_REWARDS.filter((reward) =>
    reward.missionIds.every((missionId) => missionIds.has(missionId))
  );
}

/**
 * Returns the rewards whose required missions are all present in the completed
 * set — i.e. the campaign rewards the player is now entitled to claim.
 */
export function getEarnedCampaignCompletionRewards(
  completedMissionIds: string[]
): CampaignCompletionReward[] {
  const completed = new Set(completedMissionIds);

  return CAMPAIGN_COMPLETION_REWARDS.filter((reward) =>
    reward.missionIds.every((missionId) => completed.has(missionId))
  );
}

/**
 * The welcome-trailer mission flagged to auto-launch on the player's very first
 * visit, if any. Returns the first such mission across all campaigns.
 */
export function getAutoLaunchMission(): {
  campaign: Campaign;
  mission: CampaignMission;
} | null {
  for (const campaign of CAMPAIGNS) {
    const mission = campaign.missions.find(
      (item) => item.autoLaunchOnFirstVisit
    );

    if (mission) return { campaign, mission };
  }

  return null;
}

export function getCampaignMission(
  missionId: string
): { campaign: Campaign; mission: CampaignMission; index: number } | null {
  for (const campaign of CAMPAIGNS) {
    const index = campaign.missions.findIndex((mission) => mission.id === missionId);

    if (index >= 0) {
      return {
        campaign,
        mission: campaign.missions[index],
        index,
      };
    }
  }

  return null;
}

export function isCampaignAccessible(
  campaign: Campaign,
  unlockedCampaignIds: readonly string[]
): boolean {
  return !campaign.premium || unlockedCampaignIds.includes(campaign.id);
}

export function isCampaignMissionUnlocked(
  campaign: Campaign,
  missionId: string,
  completedMissionIds: string[]
): boolean {
  const missionIndex = campaign.missions.findIndex(
    (mission) => mission.id === missionId
  );

  if (campaign.missions[missionIndex]?.available === false) return false;
  if (missionIndex <= 0) return missionIndex === 0;

  const previousMission = campaign.missions[missionIndex - 1];
  return completedMissionIds.includes(previousMission.id);
}
