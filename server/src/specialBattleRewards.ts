const BONUS_OPPONENT_NICKNAME = "DashaModels";

export const BONUS_OPPONENT_REWARD_MULTIPLIER = 3;

/** Returns the battle reward multiplier granted for facing a special opponent. */
export function getOpponentRewardMultiplier(
  opponentNickname: string | null | undefined
): number {
  return opponentNickname === BONUS_OPPONENT_NICKNAME
    ? BONUS_OPPONENT_REWARD_MULTIPLIER
    : 1;
}
