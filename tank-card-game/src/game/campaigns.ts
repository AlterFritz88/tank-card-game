import type { BattleBackgroundId } from "./battleBackgrounds";
import type { PreplacedUnit } from "./initialState";
import type { HeadquartersId } from "./types";

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
  /**
   * Auto-launch this mission once, the first time the player opens the game
   * (the welcome trailer). Marked done via local storage so it never repeats.
   */
  autoLaunchOnFirstVisit?: boolean;
  /** Skip the first-turn roll and let the player always start (scripted intros). */
  skipFirstTurnRoll?: boolean;
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
};

export const CAMPAIGNS: Campaign[] = [
  {
    id: "welcome-kursk",
    title: "Зверобой",
    description:
      "Курская дуга, июль 1943. У Понырей 9-я армия Моделя бросила в прорыв Тигры и Фердинанды. Останови клин за Центральный фронт и заслужи свою первую СУ-152.",
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
          "13 июля 1943, станция Поныри. Подбитые Тигр и Фердинанд 9-й армии Моделя застряли перед нашим рубежом. Добей их и удержи позицию.",
        briefing:
          "Поныри, командир. Тигр и Фердинанд застряли перед нами. Тяжёлую технику сперва бей артиллерией и штабом, потом добивай танками. Т-34 в атаку!",
        victoryDebrief:
          "Зверьё догорает, рубеж за нами. За этот бой — получай в часть СУ-152, «Зверобой». Теперь их броня нам не помеха.",
        defeatDebrief:
          "Прорвались, гады… Но это ещё не конец. Перегруппуемся и встретим их снова.",
        botHeadquartersId: "german_9th_army",
        botDeckId: "german_9th_army_campaign",
        playerDeckId: "welcome_kursk_player",
        backgroundId: "russian_1",
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
        // СУ-122 на задней линии, перед ней КВ-1; Т-34 на нижнем спавне.
        // Тыл: гаубица М-30 и два «лекаря» (ГАЗ-55, ПАРМ).
        playerBoardUnits: [
          { cardId: "su_122", position: { row: 0, col: 0 } },
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
      "Польская кампания 1939 года. Проведи 1-ю танковую дивизию через четыре последовательных боя.",
    playerHeadquartersId: "first_panzer_division",
    playerDeckId: "first_panzer_division_campaign",
    missions: [
      {
        id: "training-front-1",
        chapter: "Польша 1939 · Fall Weiß",
        title: "Прорыв польской границы у Розпши",
        description:
          "1–3 сентября 1939. Прорвать укрепления и выйти к реке Варта. Противник: части 7-й польской пехотной дивизии и кавалерийские бригады.",
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
          "5–8 сентября 1939. Окружить польскую армию «Прусы». Противник: 25-я польской пехотной дивизии и остатки кавалерии.",
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
          "16–20 сентября 1939. Форсировать реку и уничтожить польскую группировку. Противник: части армии «Поможе».",
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
          "20–28 сентября 1939. Захватить пригороды и поддержать 18-ю пехотную дивизию. Противник: 1-я и 13-я польские пехотные дивизии.",
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
          "10–12 мая 1940. Быстрый бросок через леса к Маасу. Противник: бельгийские Chasseurs Ardennais и лёгкие французские части.",
        available: false,
      },
      {
        id: "training-front-6",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Штурм Седана",
        description:
          "13–14 мая 1940. Форсировать Маас и захватить высоты Ла-Марфе. Противник: 55-я французская пехотная дивизия.",
        available: false,
      },
      {
        id: "training-front-7",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Рывок к Ла-Маншу",
        description:
          "15–20 мая 1940. Провести глубокий прорыв и отсечь союзников. Противник: части 1re DCR и британские арьергарды.",
        available: false,
      },
      {
        id: "training-front-8",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Бои у Дюнкерка",
        description:
          "25–31 мая 1940. Блокировать эвакуацию BEF. Противник: британские и французские части у Дюнкерка.",
        available: false,
      },
      {
        id: "training-front-9",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Прорыв линии Вейгана",
        description:
          "5–10 июня 1940. Прорвать вторую французскую линию обороны. Противник: колониальные и пехотные дивизии.",
        available: false,
      },
      {
        id: "training-front-10",
        chapter: "Франция и Бельгия 1940 · Fall Gelb / Rot",
        title: "Захват Бельфора",
        description:
          "17–22 июня 1940. Окружить остатки французской армии у линии Мажино. Противник: крепостные дивизии и остатки 2-й армии.",
        available: false,
      },
      {
        id: "training-front-11",
        chapter: "Восточный фронт 1941–1942",
        title: "Переход границы СССР",
        description:
          "22 июня 1941, Литва. Начать операцию «Барбаросса». Противник: 5-я советская танковая дивизия и пограничные части.",
        available: false,
      },
      {
        id: "training-front-12",
        chapter: "Восточный фронт 1941–1942",
        title: "Бои у Даугавпилса и Пскова",
        description:
          "Июль 1941. Захватить переправы и продвинуться к Луге. Противник: 24-я танковая и 90-я стрелковая дивизии.",
        available: false,
      },
      {
        id: "training-front-13",
        chapter: "Восточный фронт 1941–1942",
        title: "Наступление на Ленинград",
        description:
          "Август–сентябрь 1941. Прорваться через район Луги. Противник: части 3-го мехкорпуса и стрелковые дивизии.",
        available: false,
      },
      {
        id: "training-front-14",
        chapter: "Восточный фронт 1941–1942",
        title: "Бои под Москвой",
        description:
          "Октябрь–декабрь 1941. Продолжить прорыв к Москве. Противник: сибирские дивизии 20-й и 16-й советских армий.",
        available: false,
      },
      {
        id: "training-front-15",
        chapter: "Восточный фронт 1941–1942",
        title: "Оборона Ржевского выступа",
        description:
          "Январь–март 1942. Удержать позиции после потерь в технике. Противник: 29-я и 39-я советские армии.",
        available: false,
      },
      {
        id: "training-front-16",
        chapter: "Южный сектор 1943–1945",
        title: "Контратаки западнее Киева",
        description:
          "Ноябрь–декабрь 1943. Стабилизировать фронт после переброски из Греции. Противник: 1-я советская танковая армия.",
        available: false,
      },
      {
        id: "training-front-17",
        chapter: "Южный сектор 1943–1945",
        title: "Деблокирование Корсунь-Черкасского котла",
        description:
          "Январь–февраль 1944. Прорваться к окружённым войскам. Противник: 5-я гвардейская танковая армия.",
        available: false,
      },
      {
        id: "training-front-18",
        chapter: "Южный сектор 1943–1945",
        title: "Выход из котла Хубе",
        description:
          "Март 1944. Выйти из окружения в Западной Украине. Противник: танковые и механизированные корпуса двух Украинских фронтов.",
        available: false,
      },
      {
        id: "training-front-19",
        chapter: "Южный сектор 1943–1945",
        title: "Бои за Будапешт",
        description:
          "Октябрь 1944 – январь 1945. Контратаковать у Дебрецена и деблокировать город. Противник: 3-й Украинский фронт.",
        available: false,
      },
      {
        id: "training-front-20",
        chapter: "Южный сектор 1943–1945",
        title: "Последние бои у Балатона",
        description:
          "Март–май 1945. Организовать оборону и отход в Австрию. Противник: части 6-й гвардейской танковой армии.",
        available: false,
      },
    ],
  },

  {
    id: "lavrinenko-ace",
    title: "Танковый ас. Лавриненко",
    description:
      "Осень 1941 года. Проведи лучшего танкового аса Второй мировой и его 4-ю танковую бригаду от засад под Мценском до обороны Москвы. Доктрина одна: заманить и бить из засады.",
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
        description: "Сентябрь 1941. Первый бой свежей 4-й танковой бригады под Сталино.",
        briefing:
          "Бригада только сформирована, экипажи ещё не нюхали пороха. Запомни главное: стоящий в засаде Т-34 бьёт втрое сильнее, чем на ходу. Поставь машины и жди — пусть немец сам подставится. Перед нами разведбат 4-й танковой дивизии.",
        victoryDebrief:
          "Боевое крещение пройдено. Экипажи поняли цену выдержке — теперь они держат строй и ждут команды. С таким началом и Гудериана остановим.",
        defeatDebrief:
          "Поспешили — и поплатились. Танк на ходу беззащитен. В следующий раз дай немцу подойти и бей из засады, иначе бригады не останется.",
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
        description: "4 октября 1941, станция Первый Воин. Дебют засадной тактики.",
        briefing:
          "Станция Первый Воин. Здесь мы покажем катуковскую науку: подпустим немецкую волну вплотную и расстреляем её с замаскированных позиций. Не двигайся раньше времени — терпение решает всё.",
        victoryDebrief:
          "Засада сработала идеально. Немцы лезли колоннами и горели один за другим. Мы переломили их разбег — о Мценске теперь заговорят в ставке.",
        defeatDebrief:
          "Мы открылись слишком рано, и волна нас смяла. Засада прощает одну ошибку, не больше. Перегруппируемся и ударим снова.",
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
        description: "6–11 октября 1941. Подвижная оборона против корпуса Гудериана.",
        briefing:
          "Гудериан давит всем 24-м корпусом, у него штурмовые орудия. Прямого боя не выдержим — отходим с контрударами, кусаем и снова в засаду. Не дай им обойти бригаду.",
        victoryDebrief:
          "Мы измотали корпус Гудериана и выиграли время для Москвы. Подвижная оборона — наш козырь, и мы разыграли его сполна.",
        defeatDebrief:
          "Нас обошли и зажали. Стоять насмерть на месте — не наша задача; наша — бить и ускользать. Исправим.",
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
        description: "Октябрь 1941. Эшелоны идут под Москву — короткий встречный бой.",
        briefing:
          "Грузимся в эшелоны на Волоколамское направление. По дороге — немецкий разведдозор. Бой будет короткий: успей собрать карты на руке и навязать свой темп, пока они не опомнились.",
        victoryDebrief:
          "Дозор смят, дорога открыта. Бригада идёт под Москву свежей и собранной — то, что нужно перед главным.",
        defeatDebrief:
          "Дали немцу перехватить темп на марше. Под Москвой такой роскоши не будет — соберись.",
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
        description: "12–13 ноября 1941. Контрудар на укреплённое Скирманово.",
        briefing:
          "Сегодня бьём не из засады, а в атаку — нам придан рой лёгких БТ. Врывайся в Скирманово «Блицем», пока немцы не подтянули пехотные пушки. Скорость — наша броня.",
        victoryDebrief:
          "Скирманово взято. Даже в лобовой атаке бригада не дрогнула — лёгкие машины сделали своё дело на скорости.",
        defeatDebrief:
          "Лёгкие БТ сгорели у деревни. В атаке нельзя медлить — «Блиц» работает только на полном ходу. Перегруппируемся.",
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
        description: "19 ноября 1941, Гусенево. Один экипаж аса против колонны на марше.",
        briefing:
          "Машин почти не осталось — но у меня свой Т-34 и засада у Гусенево. Немецкая колонна идёт на марше, ничего не подозревая. Каждый снаряд должен бить насмерть. Это моя работа.",
        victoryDebrief:
          "Колонна стоит горящей, а мы целы. Один танк из засады стоит десятка на открытом месте — сегодня немцы это запомнили.",
        defeatDebrief:
          "Один против колонны прощает только точные выстрелы. Я промахнулся — и нас достали. Ещё раз, и без ошибок.",
        botHeadquartersId: "german_11_panzer",
        botDeckId: "german_11_panzer_campaign",
        playerDeckId: "lavrinenko_ace_campaign",
        backgroundId: "winter_1",
        illustrationId: "lavrinenko_m6",
      },
      {
        id: "lavrinenko-7",
        chapter: "Волоколамск 1941",
        title: "Плечом к плечу с Панфиловым",
        description: "16–20 ноября 1941. Держим рубеж рядом с панфиловцами.",
        briefing:
          "Встаём рядом с 316-й дивизией Панфилова. Танков мало, опора — заслоны ПТО. Здесь не маневрируют, здесь стоят насмерть. Отступать некуда — за нами Москва.",
        victoryDebrief:
          "Рубеж выстоял. Панфиловцы дрались как львы, и мы их не подвели. Москва за спиной — в безопасности ещё на день.",
        defeatDebrief:
          "Рубеж не удержали. Здесь нельзя было отступить ни на шаг. Соберём всё, что есть, и встанем снова.",
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
        description: "22 ноября 1941, Лысцево. Бригада стала 1-й гвардейской.",
        briefing:
          "Нам вручили гвардейское знамя — теперь мы 1-я гвардейская. Засадный танк бьёт ещё сильнее и первым выходит с «Блицем». Против нас элита — полк «Großdeutschland». Покажем, чего стоит гвардия.",
        victoryDebrief:
          "Гвардейское звание оправдано кровью. Даже «Großdeutschland» отступил перед нами. Знамя не запятнано.",
        defeatDebrief:
          "В первом же бою под гвардейским знаменем — неудача. Это не по-гвардейски. Возьмём себя в руки и переиграем.",
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
        description: "6–10 декабря 1941. Теперь наступаем мы.",
        briefing:
          "Пришёл наш черёд наступать. У немцев замёрзло горючее, встали моторы, снабжение просело. Гони их от Москвы — бей, пока они не оправились от мороза и наших ударов.",
        victoryDebrief:
          "Немец покатился назад от Москвы. Мы переломили хребет их наступлению — впервые они бегут, а мы гоним.",
        defeatDebrief:
          "Даже обескровленный враг ещё огрызается. Мы потеряли темп наступления. Соберёмся и дожмём.",
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
        description: "18 декабря 1941, Горюны. Последний бой аса.",
        briefing:
          "Впереди Горюны и плотный заслон — противотанковые пушки и штурмовые орудия. Их надо пробить. Я пойду первым, как всегда. Что бы ни случилось — бригада должна прорваться.",
        victoryDebrief:
          "Заслон пробит, путь открыт. Бригада прошла — это главное. Имя 4-й танковой уже не забудут.",
        defeatDebrief:
          "Заслон выстоял. Но бригада не сдаётся — соберётся и пройдёт там, где не вышло у меня.",
        botHeadquartersId: "winter_blocking_force",
        botDeckId: "winter_blocking_force_campaign",
        playerHeadquartersId: "first_guards_tank_brigade",
        playerDeckId: "lavrinenko_guards_campaign",
        backgroundId: "winter_1",
        illustrationId: "lavrinenko_m10",
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
  /**
   * Optional headquarters unlocked alongside the card reward. Granted by the
   * server when the reward is claimed, which makes it selectable in PvE/PvP.
   */
  unlockHeadquartersId?: HeadquartersId;
};

export const CAMPAIGN_COMPLETION_REWARDS: CampaignCompletionReward[] = [
  // Миссия-трейлер: за удержание рубежа у Понырей — легендарный «Зверобой»
  // СУ-152 и открытие штаба Центрального фронта для PvE/PvP.
  {
    id: "welcome_zveroboy",
    missionIds: ["welcome-kursk-1"],
    cardId: "su_152",
    copies: 1,
    unlockHeadquartersId: "soviet_central_front",
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
    // Пройдя кампанию, игрок открывает штаб 4-й танковой бригады для PvE/PvP.
    unlockHeadquartersId: "lavrinenko_tank_brigade",
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
