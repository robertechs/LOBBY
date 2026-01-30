import { getSolBalance, getCreatorWallet } from '../utils/solana';
import { 
  getBaselineBalance, 
  setBaselineBalance, 
  updateTankFromBalance,
  getCurrentTank 
} from '../utils/redis';

// Tank Tracker - Polls wallet balance every 3 seconds
// Only tracks NEW creator rewards (balance above baseline)

class TankTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastBalance = 0;

  // Start tracking
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log('📊 Starting Tank Tracker (3s polling)...');
    this.isRunning = true;

    // Initialize baseline if not set
    const currentBaseline = await getBaselineBalance();
    const creatorWallet = getCreatorWallet();
    const currentBalance = await getSolBalance(creatorWallet.publicKey.toString());
    
    if (currentBaseline === 0) {
      // First run - set current balance as baseline
      await setBaselineBalance(currentBalance);
      console.log(`📊 Initial baseline set: ${currentBalance.toFixed(4)} SOL`);
    }
    
    this.lastBalance = currentBalance;

    // Poll every 3 seconds
    this.intervalId = setInterval(() => this.updateTank(), 3000);
    
    // Do initial update
    await this.updateTank();
  }

  // Stop tracking
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📊 Tank Tracker stopped');
  }

  // Update tank value from wallet balance
  async updateTank(): Promise<void> {
    try {
      const creatorWallet = getCreatorWallet();
      const currentBalance = await getSolBalance(creatorWallet.publicKey.toString());
      
      // Update tank (balance - baseline)
      const tank = await updateTankFromBalance(currentBalance);
      
      // Log if balance changed significantly
      if (Math.abs(currentBalance - this.lastBalance) > 0.001) {
        console.log(`💰 Balance: ${currentBalance.toFixed(4)} SOL | Tank: ${tank.toFixed(4)} SOL`);
        this.lastBalance = currentBalance;
      }
    } catch (error) {
      console.error('Tank tracker error:', error);
    }
  }

  // Get current tank value
  async getTank(): Promise<number> {
    return getCurrentTank();
  }

  // Reset baseline after distribution (call after rewards are sent out)
  async resetBaseline(): Promise<void> {
    const creatorWallet = getCreatorWallet();
    const currentBalance = await getSolBalance(creatorWallet.publicKey.toString());
    await setBaselineBalance(currentBalance);
    console.log(`📊 Baseline reset to: ${currentBalance.toFixed(4)} SOL`);
  }
}

export const tankTracker = new TankTracker();
