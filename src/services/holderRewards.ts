// Holder rewards tracking (simplified for MOLTDOWN)
// In this version, rewards are distributed directly to winners, not accumulated

/**
 * Get unclaimed rewards for a wallet
 * In MOLTDOWN, rewards are paid instantly to winners, so this returns 0
 */
export async function getUnclaimedRewards(wallet: string): Promise<number> {
  // MOLTDOWN pays winners instantly, no unclaimed rewards system
  return 0;
}

/**
 * Check if wallet has any pending rewards
 */
export async function hasPendingRewards(wallet: string): Promise<boolean> {
  return false;
}
