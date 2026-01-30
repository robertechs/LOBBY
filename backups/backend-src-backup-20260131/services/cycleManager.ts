import { config } from '../config';
import { DISTRIBUTION_SPLIT } from '../types';
import {
  getCurrentTank,
  getCurrentCycleNumber,
  incrementCycleNumber,
  setCycleStartTime,
  getCycleStartTime,
  getBaselineBalance,
  getCachedAlphaClaw,
  getTopHolders,
  getHolderCount,
} from '../utils/redis';
import { createCycle, completeCycle } from '../utils/db';
import { distributeRewards } from './distributor';
import { getSolBalance, getCreatorWallet } from '../utils/solana';
import { claimCreatorFees } from './rewardClaimer';
import { tankTracker } from './tankTracker';

// Minimum SOL to keep in creator wallet for gas
const MIN_WALLET_BALANCE = 0.005;

class CycleManager {
  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;

  // Start the cycle manager (The Boil Protocol)
  async start(): Promise<void> {
    console.log('🦞 Starting The Boil Protocol...');

    // Initialize first cycle if needed
    await this.initializeCycle();

    // Check every 1 second if cycle should end (for precise timing)
    this.intervalId = setInterval(async () => {
      const timeRemaining = await this.getTimeRemaining();
      if (timeRemaining <= 0) {
        await this.executeBoil();
      }
    }, 1000);

    console.log(`🔥 Protocol active - ${config.cycleDurationMs / 1000}s execution cycles`);
  }

  // Stop the cycle manager
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Initialize a new cycle
  async initializeCycle(): Promise<void> {
    const cycleNumber = await getCurrentCycleNumber();
    const startTime = await getCycleStartTime();

    // Check if we need to start a new cycle (no start time or expired)
    const needsNewCycle = !startTime || (Date.now() - startTime.getTime() > config.cycleDurationMs);

    if (needsNewCycle) {
      console.log(`🦞 Initializing Execution Cycle #${cycleNumber}`);

      const now = new Date();
      await setCycleStartTime(now);

      // Create cycle in database (handle if already exists)
      try {
        await createCycle({
          cycleNumber,
          startTime: now,
        });
        console.log(`🔥 Cycle #${cycleNumber} started at ${now.toISOString()}`);
      } catch (error: any) {
        // If cycle already exists, just log and continue
        if (error.code === 'P2002') {
          console.log(`Cycle #${cycleNumber} already exists in database, continuing...`);
          await setCycleStartTime(now);
        } else {
          throw error;
        }
      }
    } else {
      const remaining = config.cycleDurationMs - (Date.now() - startTime!.getTime());
      console.log(`Cycle #${cycleNumber} already running. Heat: ${Math.round((1 - remaining / config.cycleDurationMs) * 100)}%`);
    }
  }

  // Execute the boil (end current cycle and distribute)
  async executeBoil(): Promise<void> {
    if (this.isProcessing) {
      console.log('Already processing, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      const cycleNumber = await getCurrentCycleNumber();
      console.log(`\n========== 🔥 BOIL EXECUTING - CYCLE #${cycleNumber} ==========`);

      // Get Alpha Claw from live blockchain holder data (biggest token holder)
      const alphaClaw = await getCachedAlphaClaw();
      const holderCount = await getHolderCount();
      const topHolders = await getTopHolders(5);

      console.log(`Holders: ${holderCount}`);
      console.log('Top 5 Token Holders:');
      topHolders.forEach((holder) => {
        console.log(
          `  ${holder.rank}. ${holder.wallet.slice(0, 8)}... - ${(holder.tokenBalance / 1_000_000).toFixed(2)} tokens`
        );
      });

      // STEP 1: Claim creator fees from pump.fun FIRST
      console.log('\n🔄 STEP 1: Claiming creator fees from pump.fun...');
      const claimResult = await claimCreatorFees();
      if (claimResult.success) {
        console.log(`✅ Claimed! Tx: ${claimResult.txSignature}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`⚠️ Claim failed or no rewards: ${claimResult.error}`);
      }

      // STEP 2: Get tank value (creator rewards only = balance - baseline)
      const creatorWallet = getCreatorWallet();
      const creatorWalletAddress = creatorWallet.publicKey.toString();
      const creatorBalance = await getSolBalance(creatorWalletAddress);
      const baseline = await getBaselineBalance();
      const trackedTank = await getCurrentTank();
      
      console.log(`\n💰 Creator wallet balance: ${creatorBalance.toFixed(4)} SOL`);
      console.log(`📊 Baseline balance: ${baseline.toFixed(4)} SOL`);
      console.log(`📊 Tank (from Redis): ${trackedTank.toFixed(4)} SOL`);
      
      // Tank = balance above baseline (only new creator rewards)
      let totalTank = Math.max(0, creatorBalance - baseline - MIN_WALLET_BALANCE);
      
      // Use tracked tank if balance calc is off
      if (totalTank < 0.001 && trackedTank > 0) {
        console.log(`⚠️ Using tracked tank value`);
        totalTank = trackedTank;
      }

      console.log(`\n🦞 Total Tank for distribution: ${totalTank.toFixed(4)} SOL`);

      // Calculate distribution (70/30 split)
      const alphaExtraction = totalTank * DISTRIBUTION_SPLIT.alphaPercent;
      const shatterAmount = totalTank * DISTRIBUTION_SPLIT.shatterPercent;

      console.log(`\n📊 Distribution:`);
      console.log(`  Alpha Extraction (70%): ${alphaExtraction.toFixed(4)} SOL`);
      console.log(`  Shell Shatter (30%): ${shatterAmount.toFixed(4)} SOL`);

      // Execute distribution
      let txAlpha: string | null = null;
      let txShatter: string | null = null;

      if (totalTank > 0 && alphaClaw) {
        console.log(`\n🦞 Alpha Claw: ${alphaClaw.wallet}`);
        console.log(`   Token Balance: ${(alphaClaw.tokenBalance / 1_000_000).toFixed(2)} tokens`);

        const result = await distributeRewards({
          alphaWallet: alphaClaw.wallet,
          alphaExtraction,
          shatterAmount,
        });

        txAlpha = result.txAlpha;
        txShatter = result.txShatter;
      } else {
        console.log('\n⚠️ No Alpha Claw this cycle (no holders or empty tank)');
      }

      // Normalize token balance for database (divide by 1e6 for 6 decimals)
      const normalizedTokenBalance = alphaClaw ? alphaClaw.tokenBalance / 1_000_000 : 0;
      
      // Complete cycle in database
      try {
        await completeCycle(cycleNumber, {
          endTime: new Date(),
          alphaWallet: alphaClaw?.wallet || null,
          alphaBought: normalizedTokenBalance, // Normalized token balance
          totalTankSol: totalTank,
          alphaExtraction,
          shatterAmount,
          participants: holderCount,
          txAlpha,
          txShatter,
        });
      } catch (error: any) {
        // If cycle doesn't exist, create and complete it
        if (error.code === 'P2025') {
          console.log(`Cycle #${cycleNumber} not in database, creating...`);
          await createCycle({
            cycleNumber,
            startTime: new Date(Date.now() - config.cycleDurationMs),
          });
          await completeCycle(cycleNumber, {
            endTime: new Date(),
            alphaWallet: alphaClaw?.wallet || null,
            alphaBought: normalizedTokenBalance,
            totalTankSol: totalTank,
            alphaExtraction,
            shatterAmount,
            participants: holderCount,
            txAlpha,
            txShatter,
          });
        } else {
          throw error;
        }
      }

      // Reset baseline after distribution (new creator rewards start from current balance)
      await tankTracker.resetBaseline();
      
      // NOTE: We do NOT reset holder data - it's live from blockchain
      // Only increment cycle number
      await incrementCycleNumber();

      // Initialize new cycle
      await this.initializeCycle();

      console.log(`========== 🦞 CYCLE #${cycleNumber} COMPLETE ==========\n`);
    } catch (error) {
      console.error('Error during boil execution:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  // Get time remaining in current cycle (in ms)
  async getTimeRemaining(): Promise<number> {
    const startTime = await getCycleStartTime();
    if (!startTime) {
      return config.cycleDurationMs;
    }

    const elapsed = Date.now() - startTime.getTime();
    const remaining = config.cycleDurationMs - elapsed;
    return Math.max(0, remaining);
  }

  // Get protocol heat level (0-100)
  async getHeatLevel(): Promise<number> {
    const remaining = await this.getTimeRemaining();
    const elapsed = config.cycleDurationMs - remaining;
    return Math.min(100, Math.round((elapsed / config.cycleDurationMs) * 100));
  }

  // Get current cycle status
  async getCurrentCycleStatus() {
    const [cycleNumber, tank, holderCount, alphaClaw, timeRemaining] =
      await Promise.all([
        getCurrentCycleNumber(),
        getCurrentTank(),
        getHolderCount(),
        getCachedAlphaClaw(),
        this.getTimeRemaining(),
      ]);

    const heatLevel = await this.getHeatLevel();

    return {
      cycleNumber,
      tank,
      participants: holderCount,
      alphaClaw,
      timeRemaining,
      heatLevel,
      timeRemainingFormatted: this.formatTime(timeRemaining),
    };
  }

  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  }
}

// Export singleton instance
export const cycleManager = new CycleManager();
