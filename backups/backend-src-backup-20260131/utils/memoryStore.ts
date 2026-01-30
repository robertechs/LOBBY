// In-memory storage for testing (replaces Redis + PostgreSQL)

interface Trade {
  wallet: string;
  amountSol: number;
  timestamp: number;
  txSignature: string;
}

interface RoundData {
  roundNumber: number;
  startTime: number;
  trades: Trade[];
  potSizeSol: number;
}

class MemoryStore {
  private currentRound: RoundData = {
    roundNumber: 1,
    startTime: Date.now(),
    trades: [],
    potSizeSol: 0,
  };

  private historicalRounds: RoundData[] = [];
  private holderRewards: Map<string, number> = new Map();
  private nextRoundBoost: number = 0;

  // Trade tracking
  addTrade(wallet: string, amountSol: number, txSignature: string): void {
    this.currentRound.trades.push({
      wallet,
      amountSol,
      timestamp: Date.now(),
      txSignature,
    });
    console.log(`[MemoryStore] Trade added: ${wallet.slice(0, 8)}... bought ${amountSol.toFixed(4)} SOL`);
  }

  // Get leaderboard (aggregated by wallet)
  getLeaderboard(): { wallet: string; totalBought: number }[] {
    const walletTotals = new Map<string, number>();
    
    for (const trade of this.currentRound.trades) {
      const current = walletTotals.get(trade.wallet) || 0;
      walletTotals.set(trade.wallet, current + trade.amountSol);
    }

    return Array.from(walletTotals.entries())
      .map(([wallet, totalBought]) => ({ wallet, totalBought }))
      .sort((a, b) => b.totalBought - a.totalBought);
  }

  // Get current champion
  getChampion(): { wallet: string; totalBought: number } | null {
    const leaderboard = this.getLeaderboard();
    return leaderboard.length > 0 ? leaderboard[0] : null;
  }

  // Get current round info
  getCurrentRound(): RoundData & { timeLeftMs: number } {
    const elapsed = Date.now() - this.currentRound.startTime;
    const roundDuration = parseInt(process.env.ROUND_DURATION_MS || '60000');
    const timeLeftMs = Math.max(0, roundDuration - elapsed);

    return {
      ...this.currentRound,
      potSizeSol: this.currentRound.potSizeSol + this.nextRoundBoost,
      timeLeftMs,
    };
  }

  // End current round and start new one
  endRound(): RoundData {
    const finishedRound = { ...this.currentRound };
    this.historicalRounds.push(finishedRound);

    // Start new round
    this.currentRound = {
      roundNumber: finishedRound.roundNumber + 1,
      startTime: Date.now(),
      trades: [],
      potSizeSol: this.nextRoundBoost,
    };
    this.nextRoundBoost = 0;

    console.log(`[MemoryStore] Round ${finishedRound.roundNumber} ended. Starting round ${this.currentRound.roundNumber}`);
    return finishedRound;
  }

  // Update pot size (from claimed rewards)
  addToPot(amountSol: number): void {
    this.currentRound.potSizeSol += amountSol;
    console.log(`[MemoryStore] Pot updated: ${this.currentRound.potSizeSol.toFixed(4)} SOL`);
  }

  // Add to next round boost
  addNextRoundBoost(amountSol: number): void {
    this.nextRoundBoost += amountSol;
  }

  // Holder rewards
  addHolderReward(wallet: string, amountSol: number): void {
    const current = this.holderRewards.get(wallet) || 0;
    this.holderRewards.set(wallet, current + amountSol);
  }

  getHolderReward(wallet: string): number {
    return this.holderRewards.get(wallet) || 0;
  }

  claimHolderReward(wallet: string): number {
    const amount = this.holderRewards.get(wallet) || 0;
    this.holderRewards.set(wallet, 0);
    return amount;
  }

  // Get round history
  getHistory(limit: number = 10): RoundData[] {
    return this.historicalRounds.slice(-limit).reverse();
  }
}

// Singleton instance
export const memoryStore = new MemoryStore();


