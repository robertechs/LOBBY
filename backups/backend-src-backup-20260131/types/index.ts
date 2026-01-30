// Trade data from PumpStream WebSocket
export interface PumpTrade {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: 'buy' | 'sell';
  tokenAmount: number;
  solAmount: number; // in lamports
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  timestamp: number;
}

// Processed buy for our tracking
export interface MoltdownBuy {
  wallet: string;
  solAmount: number; // in SOL (not lamports)
  tokenAmount: number;
  txSignature: string;
  timestamp: Date;
}

// Execution cycle data structure (The Boil Protocol)
export interface ExecutionCycle {
  id: number;
  cycleNumber: number;
  startTime: Date;
  endTime: Date | null;
  alphaWallet: string | null; // Alpha Claw winner
  alphaBought: number;
  totalTankSol: number; // The Tank
  alphaExtraction: number; // 70% payout
  shellShatter: number; // 30% buyback & burn
  participants: number;
  txAlpha: string | null;
  txShatter: string | null;
  status: 'active' | 'processing' | 'completed';
}

// Leaderboard entry (legacy - trade-based)
export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  totalBought: number; // in SOL
  txCount: number;
}

// Token Holder (live from blockchain)
export interface TokenHolder {
  rank: number;
  wallet: string;
  tokenBalance: number; // Raw token amount
}

// API Response types
export interface CurrentRoundResponse {
  roundNumber: number;
  timeLeftMs: number;
  potSizeSol: number;
  potSizeUsd: number;
  champion: LeaderboardEntry | null;
  participants: number;
}

export interface UserStats {
  wallet: string;
  currentRoundBought: number;
  currentRank: number;
  totalWins: number;
  totalEarned: number;
  unclaimedRewards: number;
}

// Distribution split configuration (The Boil Protocol)
export interface DistributionConfig {
  alphaPercent: number;   // 70% - Alpha Claw extraction
  shatterPercent: number; // 30% - Shell Shatter (buyback & burn)
}

export const DISTRIBUTION_SPLIT: DistributionConfig = {
  alphaPercent: 0.70,
  shatterPercent: 0.30,
};

// Redis keys (The Boil Protocol)
export const REDIS_KEYS = {
  // Cycle tracking
  CURRENT_CYCLE_START: 'cycle:current:start_time',
  CURRENT_TANK: 'cycle:current:tank', // The Tank (creator rewards only)
  CURRENT_CYCLE_NUMBER: 'cycle:current:number',
  BASELINE_BALANCE: 'wallet:baseline_balance', // Wallet balance before creator rewards
  TOTAL_VOLUME: 'stats:total_volume',
  
  // Live holder tracking (from blockchain)
  HOLDERS_TOP50: 'holders:top50', // Sorted set of top 50 holders
  HOLDERS_LAST_UPDATE: 'holders:last_update', // Timestamp of last fetch
  HOLDERS_ALPHA: 'holders:alpha', // Current alpha claw wallet (JSON)
  HOLDERS_COUNT: 'holders:count', // Total holder count
  
  // Legacy (deprecated)
  CURRENT_CYCLE_BUYERS: 'cycle:current:buyers',
} as const;

