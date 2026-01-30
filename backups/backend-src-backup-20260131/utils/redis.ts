import { Redis } from '@upstash/redis';
import { REDIS_KEYS, LeaderboardEntry } from '../types';

// Initialize Upstash Redis client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

console.log('🦞 Moltdown Redis client initialized');

// Add or update buyer's total for current cycle
export async function addBuyerAmount(
  wallet: string,
  solAmount: number
): Promise<void> {
  await redis.zincrby(REDIS_KEYS.CURRENT_CYCLE_BUYERS, solAmount, wallet);
}

// Get top buyers for current cycle
export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  // Use ZREVRANGE to get top scorers (descending order)
  const results = await redis.zrange(
    REDIS_KEYS.CURRENT_CYCLE_BUYERS,
    0,
    limit - 1,
    { rev: true, withScores: true }
  ) as any[];

  const leaderboard: LeaderboardEntry[] = [];
  
  if (!results || results.length === 0) {
    return leaderboard;
  }

  // Upstash with withScores returns flat array or object array
  if (Array.isArray(results) && results.length > 0) {
    // Check if first element is an object with score property
    if (typeof results[0] === 'object' && results[0] !== null && 'score' in results[0]) {
      // Object format: [{member, score}, ...]
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        const wallet = String(item.member || item.value || '');
        // Only add if wallet looks like a valid Solana address (32+ chars)
        if (wallet.length >= 32) {
          leaderboard.push({
            rank: leaderboard.length + 1,
            wallet,
            totalBought: Number(item.score) || 0,
            txCount: 0,
          });
        }
      }
    } else {
      // Flat array format: [member1, score1, member2, score2, ...]
      for (let i = 0; i < results.length; i += 2) {
        const wallet = String(results[i]);
        const score = Number(results[i + 1]) || 0;
        // Only add if wallet looks like a valid Solana address (32+ chars)
        if (wallet.length >= 32) {
          leaderboard.push({
            rank: leaderboard.length + 1,
            wallet,
            totalBought: score,
            txCount: 0,
          });
        }
      }
    }
  }

  return leaderboard;
}

// Get Alpha Claw (top buyer)
export async function getAlphaClaw(): Promise<LeaderboardEntry | null> {
  const top = await getLeaderboard(1);
  return top.length > 0 ? top[0] : null;
}

// Legacy alias for compatibility
export async function getChampion(): Promise<LeaderboardEntry | null> {
  return getAlphaClaw();
}

// Get buyer's current cycle total
export async function getBuyerTotal(wallet: string): Promise<number> {
  const score = await redis.zscore(REDIS_KEYS.CURRENT_CYCLE_BUYERS, wallet);
  return score ? score : 0;
}

// Get buyer's rank
export async function getBuyerRank(wallet: string): Promise<number> {
  const rank = await redis.zrevrank(REDIS_KEYS.CURRENT_CYCLE_BUYERS, wallet);
  return rank !== null ? rank + 1 : 0;
}

// Get participant count
export async function getParticipantCount(): Promise<number> {
  return await redis.zcard(REDIS_KEYS.CURRENT_CYCLE_BUYERS);
}

// Get current tank size
export async function getCurrentTank(): Promise<number> {
  const tank = await redis.get<string>(REDIS_KEYS.CURRENT_TANK);
  return tank ? parseFloat(tank) : 0;
}

// Legacy alias for compatibility
export async function getCurrentPot(): Promise<number> {
  return getCurrentTank();
}

// Add to current tank
export async function addToTank(amount: number): Promise<void> {
  await redis.incrbyfloat(REDIS_KEYS.CURRENT_TANK, amount);
}

// Legacy alias
export async function addToPot(amount: number): Promise<void> {
  return addToTank(amount);
}

// Set current tank
export async function setTank(amount: number): Promise<void> {
  await redis.set(REDIS_KEYS.CURRENT_TANK, amount.toString());
}

// Legacy alias
export async function setPot(amount: number): Promise<void> {
  return setTank(amount);
}

// Track total volume for the cycle
export async function addToVolume(amount: number): Promise<void> {
  await redis.incrbyfloat('moltdown:current_cycle_volume', amount);
}

// Get total volume for current cycle
export async function getTotalVolume(): Promise<number> {
  const volume = await redis.get<string>('moltdown:current_cycle_volume');
  return volume ? parseFloat(volume) : 0;
}

// Get accumulated creator rewards
export async function getAccumulatedRewards(): Promise<number> {
  const tank = await getCurrentTank();
  return tank;
}

// Get cycle start time
export async function getCycleStartTime(): Promise<Date | null> {
  const timestamp = await redis.get<string>(REDIS_KEYS.CURRENT_CYCLE_START);
  return timestamp ? new Date(parseInt(timestamp, 10)) : null;
}

// Legacy alias
export async function getRoundStartTime(): Promise<Date | null> {
  return getCycleStartTime();
}

// Set cycle start time
export async function setCycleStartTime(date: Date): Promise<void> {
  await redis.set(REDIS_KEYS.CURRENT_CYCLE_START, date.getTime().toString());
}

// Legacy alias
export async function setRoundStartTime(date: Date): Promise<void> {
  return setCycleStartTime(date);
}

// Get current cycle number
export async function getCurrentCycleNumber(): Promise<number> {
  const num = await redis.get<string>(REDIS_KEYS.CURRENT_CYCLE_NUMBER);
  return num ? parseInt(num, 10) : 1;
}

// Legacy alias
export async function getCurrentRoundNumber(): Promise<number> {
  return getCurrentCycleNumber();
}

// Increment cycle number
export async function incrementCycleNumber(): Promise<number> {
  return await redis.incr(REDIS_KEYS.CURRENT_CYCLE_NUMBER);
}

// Legacy alias
export async function incrementRoundNumber(): Promise<number> {
  return incrementCycleNumber();
}

// Set cycle number (for reset)
export async function setCycleNumber(num: number): Promise<void> {
  await redis.set(REDIS_KEYS.CURRENT_CYCLE_NUMBER, num.toString());
}

// Legacy alias
export async function setRoundNumber(num: number): Promise<void> {
  return setCycleNumber(num);
}

// Reset cycle data for new cycle
export async function resetCycleData(): Promise<void> {
  await redis.del(REDIS_KEYS.CURRENT_CYCLE_BUYERS);
  await redis.set(REDIS_KEYS.CURRENT_TANK, '0');
  await redis.set('moltdown:current_cycle_volume', '0');
}

// Legacy alias
export async function resetRoundData(): Promise<void> {
  return resetCycleData();
}

// Get all current cycle data
export async function getCurrentCycleData() {
  const [tank, startTime, cycleNumber, participantCount] =
    await Promise.all([
      getCurrentTank(),
      getCycleStartTime(),
      getCurrentCycleNumber(),
      getParticipantCount(),
    ]);

  return {
    tank,
    startTime,
    cycleNumber,
    participantCount,
  };
}

// Legacy alias
export async function getCurrentRoundData() {
  const data = await getCurrentCycleData();
  return {
    pot: data.tank,
    startTime: data.startTime,
    roundNumber: data.cycleNumber,
    boost: 0, // Removed in new protocol
    participantCount: data.participantCount,
  };
}

// Legacy functions for holder rewards (removed in new protocol)
export async function getNextRoundBoost(): Promise<number> {
  return 0; // Removed
}

export async function setNextRoundBoost(_amount: number): Promise<void> {
  // Removed - no-op
}

// ============= BASELINE BALANCE TRACKING =============
// This tracks the wallet balance BEFORE creator rewards started accumulating
// Tank = current wallet balance - baseline balance

// Get baseline wallet balance
export async function getBaselineBalance(): Promise<number> {
  const baseline = await redis.get<string>(REDIS_KEYS.BASELINE_BALANCE);
  return baseline ? parseFloat(baseline) : 0;
}

// Set baseline wallet balance (call after each distribution)
export async function setBaselineBalance(balance: number): Promise<void> {
  await redis.set(REDIS_KEYS.BASELINE_BALANCE, balance.toString());
  console.log(`📊 Baseline balance set to: ${balance.toFixed(4)} SOL`);
}

// Update tank value (creator rewards = wallet balance - baseline)
export async function updateTankFromBalance(currentBalance: number): Promise<number> {
  const baseline = await getBaselineBalance();
  const tank = Math.max(0, currentBalance - baseline - 0.005); // Keep 0.005 for gas
  await redis.set(REDIS_KEYS.CURRENT_TANK, tank.toString());
  return tank;
}

// ============= LIVE HOLDER TRACKING (FROM BLOCKCHAIN) =============
// Token holder data structure
export interface TokenHolder {
  rank: number;
  wallet: string;
  tokenBalance: number;
}

// Cache top holders (called every 3 seconds by holderTracker)
export async function cacheTopHolders(holders: TokenHolder[]): Promise<void> {
  if (holders.length === 0) return;
  
  try {
    // Store holders as JSON array (simpler and more reliable)
    await redis.set(REDIS_KEYS.HOLDERS_TOP50, JSON.stringify(holders));
    
    // Store alpha claw separately for quick access
    if (holders.length > 0) {
      await redis.set(REDIS_KEYS.HOLDERS_ALPHA, JSON.stringify(holders[0]));
    }
    
    // Update timestamp and count
    await redis.set(REDIS_KEYS.HOLDERS_LAST_UPDATE, Date.now().toString());
    await redis.set(REDIS_KEYS.HOLDERS_COUNT, holders.length.toString());
  } catch (error) {
    console.error('Error caching holders:', error);
  }
}

// Get top N holders from cache
export async function getTopHolders(limit: number = 5): Promise<TokenHolder[]> {
  try {
    const data = await redis.get<TokenHolder[]>(REDIS_KEYS.HOLDERS_TOP50);
    
    if (!data || !Array.isArray(data)) {
      return [];
    }
    
    return data.slice(0, limit);
  } catch (error) {
    console.error('Error getting top holders:', error);
    return [];
  }
}

// Get cached alpha claw (top holder)
export async function getCachedAlphaClaw(): Promise<TokenHolder | null> {
  try {
    const alpha = await redis.get<TokenHolder>(REDIS_KEYS.HOLDERS_ALPHA);
    if (!alpha || !alpha.wallet) return null;
    
    return {
      rank: 1,
      wallet: alpha.wallet,
      tokenBalance: alpha.tokenBalance,
    };
  } catch {
    return null;
  }
}

// Get holder count
export async function getHolderCount(): Promise<number> {
  const count = await redis.get<string>(REDIS_KEYS.HOLDERS_COUNT);
  return count ? parseInt(count) : 0;
}

// Get last holder update timestamp
export async function getHolderLastUpdate(): Promise<number> {
  const ts = await redis.get<string>(REDIS_KEYS.HOLDERS_LAST_UPDATE);
  return ts ? parseInt(ts) : 0;
}
