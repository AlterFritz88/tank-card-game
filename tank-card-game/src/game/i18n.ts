import { getSettings, useSettings, type Language } from "./settings";

export type TranslationKey =
  | "common.back"
  | "common.cancel"
  | "common.close"
  | "common.loading"
  | "common.retry"
  | "common.guest"
  | "common.all"
  | "common.profileServerUnavailable"
  | "common.profileSyncWait"
  | "common.invalidDeck"
  | "settings.title"
  | "settings.close"
  | "settings.sound"
  | "settings.musicVolume"
  | "settings.effectsVolume"
  | "settings.language"
  | "settings.languageNote"
  | "settings.profile"
  | "settings.signOut"
  | "settings.signingOut"
  | "settings.signOutRegisteredConfirm"
  | "settings.signOutGuestConfirm"
  | "settings.signOutError"
  | "settings.registeredSignOutNote"
  | "settings.guestSignOutNote"
  | "settings.enterFullscreen"
  | "settings.exitFullscreen"
  | "main.selectBattleMode"
  | "main.campaign"
  | "main.quickBattle"
  | "main.aiBattle"
  | "main.tutorial"
  | "main.research"
  | "main.collection"
  | "main.shop"
  | "main.support"
  | "account.premiumProfile"
  | "account.basicProfile"
  | "account.premiumAccount"
  | "account.basicAccount"
  | "account.openProfile"
  | "resources.freeXp"
  | "resources.ironTracks"
  | "resources.goldTracks"
  | "resources.openShop"
  | "resources.exchangeGold"
  | "auth.profileLogin"
  | "auth.commanderNickname"
  | "auth.nicknameHint"
  | "auth.playAsGuest"
  | "auth.saving"
  | "auth.login"
  | "auth.loginLabel"
  | "auth.register"
  | "auth.accountLogin"
  | "auth.password"
  | "auth.repeatPassword"
  | "auth.promoCode"
  | "auth.createAccount"
  | "auth.connecting"
  | "auth.guestProgressNote"
  | "auth.legalConsent"
  | "auth.legalRequired"
  | "auth.loginFailed"
  | "auth.emailInvalid"
  | "auth.passwordMismatch"
  | "auth.registering"
  | "auth.registerAccount"
  | "auth.cancel"
  | "auth.guestMergeNote"
  | "auth.registerFailed"
  | "battle.selectCompany"
  | "battle.selectOperation"
  | "battle.selectHeadquarters"
  | "battle.stockDeck"
  | "battle.deckStrength"
  | "battle.createDeck"
  | "battle.filterDecksByNation"
  | "battle.allNations"
  | "battle.playDeck"
  | "battle.searchingOpponent"
  | "battle.pvpServerUnavailable"
  | "battle.opponentFound"
  | "battle.autobattleIn"
  | "battle.secondsShort"
  | "battle.aiBattle"
  | "battle.playerTurn"
  | "battle.enemyTurn"
  | "battle.yourTurn"
  | "battle.endTurn"
  | "battle.surrender"
  | "battle.newBattle"
  | "battle.toMenu"
  | "battle.rollFirstTurn"
  | "battle.rollAlt"
  | "battle.youStart"
  | "battle.enemyStarts"
  | "battle.playerStarts"
  | "battle.surrenderConfirm"
  | "battle.cancelSearch"
  | "battle.queueHint"
  | "battle.deleteDeck"
  | "battle.deleteDeckConfirm"
  | "battle.editDeck"
  | "battle.previewCloseHint"
  | "battle.closeCardPreview"
  | "battle.closeUnitPreview"
  | "campaign.reward"
  | "campaign.rewardReceived"
  | "campaign.rewardClaiming"
  | "campaign.rewardClaim"
  | "campaign.rewardLocked"
  | "campaign.rewardClaimError"
  | "campaign.rewardUnavailable"
  | "campaign.operation"
  | "campaign.completed"
  | "campaign.soon"
  | "campaign.claimReward"
  | "campaign.available"
  | "support.describeMore"
  | "support.sendFailed"
  | "support.answerByEmail"
  | "support.title"
  | "support.close"
  | "support.contact"
  | "support.contactPlaceholder"
  | "support.message"
  | "support.messagePlaceholder"
  | "support.sending"
  | "support.send"
  | "support.sent";

type TranslationMap = Record<TranslationKey, string>;

export const TRANSLATIONS: Record<Language, TranslationMap> = {
  ru: {
    "common.back": "Назад",
    "common.cancel": "Отмена",
    "common.close": "Закрыть",
    "common.loading": "Загрузка...",
    "common.retry": "Повторить",
    "common.guest": "Гость",
    "common.all": "Все",
    "common.profileServerUnavailable": "Сервер профиля недоступен",
    "common.profileSyncWait": "Дождитесь синхронизации профиля",
    "common.invalidDeck": "Некорректная колода",
    "settings.title": "Настройки",
    "settings.close": "Закрыть настройки",
    "settings.sound": "Звук",
    "settings.musicVolume": "Громкость музыки",
    "settings.effectsVolume": "Громкость эффектов",
    "settings.language": "Язык",
    "settings.languageNote": "Язык интерфейса можно сменить в любой момент.",
    "settings.profile": "Профиль",
    "settings.signOut": "Выйти из профиля",
    "settings.signingOut": "Выход...",
    "settings.signOutRegisteredConfirm":
      "Выйти из профиля и вернуться к гостевому входу?",
    "settings.signOutGuestConfirm":
      "Выйти из профиля? Гостевой прогресс на этом устройстве будет удалён.",
    "settings.signOutError": "Не удалось выйти из профиля",
    "settings.registeredSignOutNote": "Вы вернётесь к гостевому входу.",
    "settings.guestSignOutNote":
      "Гостевой прогресс будет обнулён на этом устройстве.",
    "settings.enterFullscreen": "На весь экран",
    "settings.exitFullscreen": "Выйти из полноэкранного режима",
    "main.selectBattleMode": "ВЫБЕРИ РЕЖИМ БОЯ",
    "main.campaign": "Кампания",
    "main.quickBattle": "Быстрый бой",
    "main.aiBattle": "Бой против ИИ",
    "main.tutorial": "Обучение",
    "main.research": "Исследования",
    "main.collection": "Коллекция",
    "main.shop": "Магазин",
    "main.support": "Поддержка",
    "account.premiumProfile": "Премиум профиль",
    "account.basicProfile": "Базовый профиль",
    "account.premiumAccount": "Премиум аккаунт",
    "account.basicAccount": "Базовый аккаунт",
    "account.openProfile": "Открыть профиль игрока",
    "resources.freeXp": "Свободный опыт",
    "resources.ironTracks": "Железные траки",
    "resources.goldTracks": "Золотые траки",
    "resources.openShop": "Открыть магазин",
    "resources.exchangeGold": "Обменять золотые траки на железные",
    "auth.profileLogin": "Вход в штабной профиль",
    "auth.commanderNickname": "Ник командира",
    "auth.nicknameHint":
      "Ник: 3-14 символов, только латинские буквы, цифры, дефис и нижнее подчёркивание",
    "auth.playAsGuest": "Играть как гость",
    "auth.saving": "Сохранение...",
    "auth.login": "Войти",
    "auth.loginLabel": "Логин",
    "auth.register": "Регистрация",
    "auth.accountLogin": "Вход в аккаунт",
    "auth.password": "Пароль",
    "auth.repeatPassword": "Повторить пароль",
    "auth.promoCode": "Промокод",
    "auth.createAccount": "Создать аккаунт",
    "auth.connecting": "Связь...",
    "auth.guestProgressNote":
      "Гостевой прогресс привязан к этому устройству. Позже его можно будет перенести в полноценный аккаунт.",
    "auth.legalConsent": "Я ознакомился и согласен:",
    "auth.legalRequired":
      "Необходимо ознакомиться с документами и принять условия",
    "auth.loginFailed": "Не удалось войти",
    "auth.emailInvalid": "Укажите корректный e-mail",
    "auth.passwordMismatch": "Пароли не совпадают",
    "auth.registering": "Регистрация...",
    "auth.registerAccount": "Зарегистрироваться",
    "auth.cancel": "Отмена",
    "auth.guestMergeNote": "Гостевой прогресс будет перенесён в новый аккаунт.",
    "auth.registerFailed": "Не удалось зарегистрироваться",
    "battle.selectCompany": "ВЫБЕРИ КАМПАНИЮ",
    "battle.selectOperation": "Выбор операции",
    "battle.selectHeadquarters": "ВЫБЕРИ ШТАБ",
    "battle.stockDeck": "Стоковая колода",
    "battle.deckStrength": "сила",
    "battle.createDeck": "Создать колоду",
    "battle.filterDecksByNation": "Фильтр колод по нации",
    "battle.allNations": "Все нации",
    "battle.playDeck": "Играть колодой",
    "battle.searchingOpponent": "ПОИСК ПРОТИВНИКА",
    "battle.pvpServerUnavailable": "PVP-СЕРВЕР НЕДОСТУПЕН",
    "battle.opponentFound": "ПРОТИВНИК НАЙДЕН",
    "battle.autobattleIn": "АВТОБОЙ ЧЕРЕЗ",
    "battle.secondsShort": "СЕК",
    "battle.aiBattle": "Бой против ИИ",
    "battle.playerTurn": "ХОД ИГРОКА",
    "battle.enemyTurn": "ХОД ВРАГА",
    "battle.yourTurn": "ТВОЙ ХОД",
    "battle.endTurn": "Конец хода",
    "battle.surrender": "Сдаться",
    "battle.newBattle": "Новый бой",
    "battle.toMenu": "В меню",
    "battle.rollFirstTurn": "Определяем первый ход",
    "battle.rollAlt": "Жеребьёвка первого хода",
    "battle.youStart": "ПЕРВЫМ ХОДИШЬ ТЫ",
    "battle.enemyStarts": "ПЕРВЫМ ХОДИТ ВРАГ",
    "battle.playerStarts": "ПЕРВЫМ ХОДИТ ИГРОК",
    "battle.surrenderConfirm": "Сдаться и засчитать поражение?",
    "battle.cancelSearch": "Отмена поиска",
    "battle.queueHint":
      "Ты в очереди. Как только второй игрок нажмёт “Играть PVP”, бой начнётся автоматически.",
    "battle.deleteDeck": "Удалить колоду",
    "battle.deleteDeckConfirm": "Удалить колоду",
    "battle.editDeck": "Редактировать колоду",
    "battle.previewCloseHint": "ПКМ по фону или Esc — закрыть",
    "battle.closeCardPreview": "Закрыть просмотр карты",
    "battle.closeUnitPreview": "Закрыть просмотр юнита",
    "campaign.reward": "Награда",
    "campaign.rewardReceived": "Получено",
    "campaign.rewardClaiming": "Выдача…",
    "campaign.rewardClaim": "Забрать",
    "campaign.rewardLocked": "Закрыто",
    "campaign.rewardClaimError":
      "Награда не выдана: сервер профиля недоступен",
    "campaign.rewardUnavailable": "Сервер профиля недоступен",
    "campaign.operation": "Операция",
    "campaign.completed": "Пройдено",
    "campaign.soon": "Скоро",
    "campaign.claimReward": "Заберите награду",
    "campaign.available": "Доступно",
    "support.describeMore": "Опишите проблему чуть подробнее.",
    "support.sendFailed": "Не удалось отправить обращение.",
    "support.answerByEmail":
      "Ответ вы получите по e-mail, который указан при регистрации.",
    "support.title": "Поддержка",
    "support.close": "Закрыть поддержку",
    "support.contact": "Контакт для ответа",
    "support.contactPlaceholder": "email, ник в Telegram или Discord",
    "support.message": "Что случилось?",
    "support.messagePlaceholder":
      "Опишите проблему, что нажимали и что ожидали увидеть",
    "support.sending": "Отправка...",
    "support.send": "Отправить",
    "support.sent":
      "Сообщение отправлено. Ответ вы получите по e-mail, указанному при регистрации.",
  },
  en: {
    "common.back": "Back",
    "common.cancel": "Cancel",
    "common.close": "Close",
    "common.loading": "Loading...",
    "common.retry": "Retry",
    "common.guest": "Guest",
    "common.all": "All",
    "common.profileServerUnavailable": "Profile server is unavailable",
    "common.profileSyncWait": "Wait for profile synchronization",
    "common.invalidDeck": "Invalid deck",
    "settings.title": "Settings",
    "settings.close": "Close settings",
    "settings.sound": "Sound",
    "settings.musicVolume": "Music volume",
    "settings.effectsVolume": "Effects volume",
    "settings.language": "Language",
    "settings.languageNote": "You can change the interface language at any time.",
    "settings.profile": "Profile",
    "settings.signOut": "Sign out",
    "settings.signingOut": "Signing out...",
    "settings.signOutRegisteredConfirm":
      "Sign out and return to guest entry?",
    "settings.signOutGuestConfirm":
      "Sign out? Guest progress on this device will be deleted.",
    "settings.signOutError": "Could not sign out",
    "settings.registeredSignOutNote": "You will return to guest entry.",
    "settings.guestSignOutNote":
      "Guest progress will be reset on this device.",
    "settings.enterFullscreen": "Fullscreen",
    "settings.exitFullscreen": "Exit fullscreen",
    "main.selectBattleMode": "SELECT BATTLE MODE",
    "main.campaign": "Campaign",
    "main.quickBattle": "Quick Battle",
    "main.aiBattle": "Battle vs AI",
    "main.tutorial": "Tutorial",
    "main.research": "Research",
    "main.collection": "Collection",
    "main.shop": "Shop",
    "main.support": "Support",
    "account.premiumProfile": "Premium profile",
    "account.basicProfile": "Basic profile",
    "account.premiumAccount": "Premium account",
    "account.basicAccount": "Basic account",
    "account.openProfile": "Open player profile",
    "resources.freeXp": "Free XP",
    "resources.ironTracks": "Iron tracks",
    "resources.goldTracks": "Gold tracks",
    "resources.openShop": "Open shop",
    "resources.exchangeGold": "Exchange gold tracks for iron tracks",
    "auth.profileLogin": "Headquarters profile entry",
    "auth.commanderNickname": "Commander nickname",
    "auth.nicknameHint":
      "Nickname: 3-14 characters, Latin letters, digits, hyphen and underscore only",
    "auth.playAsGuest": "Play as guest",
    "auth.saving": "Saving...",
    "auth.login": "Log in",
    "auth.loginLabel": "Login",
    "auth.register": "Register",
    "auth.accountLogin": "Account login",
    "auth.password": "Password",
    "auth.repeatPassword": "Repeat password",
    "auth.promoCode": "Promo code",
    "auth.createAccount": "Create account",
    "auth.connecting": "Connecting...",
    "auth.guestProgressNote":
      "Guest progress is stored on this device. You can move it to a full account later.",
    "auth.legalConsent": "I have read and accept:",
    "auth.legalRequired": "You must read and accept the documents",
    "auth.loginFailed": "Could not sign in",
    "auth.emailInvalid": "Enter a valid e-mail",
    "auth.passwordMismatch": "Passwords do not match",
    "auth.registering": "Registering...",
    "auth.registerAccount": "Create account",
    "auth.cancel": "Cancel",
    "auth.guestMergeNote": "Guest progress will be moved to the new account.",
    "auth.registerFailed": "Could not create account",
    "battle.selectCompany": "SELECT CAMPAIGN",
    "battle.selectOperation": "Select Operation",
    "battle.selectHeadquarters": "SELECT HEADQUARTERS",
    "battle.stockDeck": "Stock deck",
    "battle.deckStrength": "power",
    "battle.createDeck": "Create deck",
    "battle.filterDecksByNation": "Filter decks by nation",
    "battle.allNations": "All nations",
    "battle.playDeck": "Play deck",
    "battle.searchingOpponent": "SEARCHING FOR OPPONENT",
    "battle.pvpServerUnavailable": "PVP SERVER UNAVAILABLE",
    "battle.opponentFound": "OPPONENT FOUND",
    "battle.autobattleIn": "AUTO BATTLE IN",
    "battle.secondsShort": "SEC",
    "battle.aiBattle": "Battle vs AI",
    "battle.playerTurn": "PLAYER TURN",
    "battle.enemyTurn": "ENEMY TURN",
    "battle.yourTurn": "YOUR TURN",
    "battle.endTurn": "End Turn",
    "battle.surrender": "Surrender",
    "battle.newBattle": "New Battle",
    "battle.toMenu": "To Menu",
    "battle.rollFirstTurn": "Determining first turn",
    "battle.rollAlt": "First turn roll",
    "battle.youStart": "YOU GO FIRST",
    "battle.enemyStarts": "ENEMY GOES FIRST",
    "battle.playerStarts": "PLAYER GOES FIRST",
    "battle.surrenderConfirm": "Surrender and take a defeat?",
    "battle.cancelSearch": "Cancel search",
    "battle.queueHint":
      "You are in queue. The battle will start automatically when another player joins PVP.",
    "battle.deleteDeck": "Delete deck",
    "battle.deleteDeckConfirm": "Delete deck",
    "battle.editDeck": "Edit deck",
    "battle.previewCloseHint": "Right-click the background or press Esc to close",
    "battle.closeCardPreview": "Close card preview",
    "battle.closeUnitPreview": "Close unit preview",
    "campaign.reward": "Reward",
    "campaign.rewardReceived": "Received",
    "campaign.rewardClaiming": "Claiming...",
    "campaign.rewardClaim": "Claim",
    "campaign.rewardLocked": "Locked",
    "campaign.rewardClaimError":
      "Reward was not granted: profile server is unavailable",
    "campaign.rewardUnavailable": "Profile server is unavailable",
    "campaign.operation": "Operation",
    "campaign.completed": "Completed",
    "campaign.soon": "Soon",
    "campaign.claimReward": "Claim reward",
    "campaign.available": "Available",
    "support.describeMore": "Please describe the issue in a little more detail.",
    "support.sendFailed": "Could not send the request.",
    "support.answerByEmail":
      "You will receive an answer at the e-mail used for registration.",
    "support.title": "Support",
    "support.close": "Close support",
    "support.contact": "Reply contact",
    "support.contactPlaceholder": "email, Telegram or Discord nickname",
    "support.message": "What happened?",
    "support.messagePlaceholder":
      "Describe the issue, what you clicked and what you expected to see",
    "support.sending": "Sending...",
    "support.send": "Send",
    "support.sent":
      "Message sent. You will receive an answer at the e-mail used for registration.",
  },
};

export function translate(key: TranslationKey, language = getSettings().language) {
  return TRANSLATIONS[language][key] ?? TRANSLATIONS.ru[key] ?? key;
}

export function useI18n() {
  const { language } = useSettings();

  return {
    language,
    t: (key: TranslationKey) => translate(key, language),
  };
}
