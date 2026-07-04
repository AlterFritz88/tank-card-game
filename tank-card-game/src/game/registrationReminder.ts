import { isRegisteredUserId } from "./playerIdentity";

/** Показывать напоминание о регистрации после каждых N завершённых боёв. */
export const REGISTRATION_REMINDER_BATTLE_INTERVAL = 3;

/**
 * Счётчик завершённых боёв гостя (любой режим: PVP, PVE, обучение, кампании).
 * Живёт локально — незарегистрированному игроку каждые
 * REGISTRATION_REMINDER_BATTLE_INTERVAL боёв показываем напоминание, что без
 * регистрации прогресс можно потерять.
 */
const GUEST_BATTLE_COUNT_KEY = "panzershrek.guestBattleCount";

function readBattleCount(): number {
  try {
    const rawValue = window.localStorage.getItem(GUEST_BATTLE_COUNT_KEY);
    const value = rawValue ? Number.parseInt(rawValue, 10) : 0;

    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeBattleCount(value: number) {
  try {
    window.localStorage.setItem(GUEST_BATTLE_COUNT_KEY, String(value));
  } catch {
    // Ignore storage failures — at worst the reminder cadence resets.
  }
}

/**
 * Записывает завершённый бой и сообщает, пора ли показать незарегистрированному
 * игроку напоминание о регистрации. Для зарегистрированных аккаунтов ничего не
 * считает и всегда возвращает false.
 */
export function recordBattleForRegistrationReminder(): boolean {
  if (isRegisteredUserId()) return false;

  const nextCount = readBattleCount() + 1;
  writeBattleCount(nextCount);

  return nextCount % REGISTRATION_REMINDER_BATTLE_INTERVAL === 0;
}
