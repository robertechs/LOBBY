import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { connection } from '../utils/solana';
import { config } from '../config';
import { 
  cacheTopHolders, 
  getTopHolders, 
  getCachedAlphaClaw,
  TokenHolder 
} from '../utils/redis';

// Holder Tracker - Fetches live token holders from Solana every 3 seconds
// Alpha Claw = wallet with the highest token balance

// pump.fun program ID
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Derive the pump.fun bonding curve PDA for a token
function getBondingCurvePDA(tokenMint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), tokenMint.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  );
  return pda;
}

class HolderTracker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastUpdate = 0;
  private readonly POLL_INTERVAL_MS = 3000; // 3 seconds

  // Start tracking holders
  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log('📊 Starting Holder Tracker (3s polling from blockchain)...');
    this.isRunning = true;

    // Initial fetch
    await this.fetchAndCacheHolders();

    // Poll every 3 seconds
    this.intervalId = setInterval(() => {
      this.fetchAndCacheHolders();
    }, this.POLL_INTERVAL_MS);
  }

  // Stop tracking
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📊 Holder Tracker stopped');
  }

  // Fetch all token holders from blockchain and cache top 50
  async fetchAndCacheHolders(): Promise<void> {
    try {
      const startTime = Date.now();
      const holders = await this.getTokenHolders();
      
      if (holders.length > 0) {
        // Cache top 50 holders
        await cacheTopHolders(holders.slice(0, 50));
        
        const elapsed = Date.now() - startTime;
        
        // Log only if there's a change or first fetch
        if (this.lastUpdate === 0 || elapsed > 1000) {
          console.log(`📊 Fetched ${holders.length} holders in ${elapsed}ms. Alpha: ${holders[0]?.wallet.slice(0, 8)}... (${holders[0]?.tokenBalance.toFixed(0)} tokens)`);
        }
        
        this.lastUpdate = Date.now();
      }
    } catch (error) {
      console.error('Holder tracker error:', error);
    }
  }

  // Get all token holders from Solana RPC
  async getTokenHolders(): Promise<TokenHolder[]> {
    const mintPubkey = new PublicKey(config.moltdownTokenMint);
    
    try {
      // Use getTokenLargestAccounts - more reliable and returns top 20 holders
      const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey);
      
      if (!largestAccounts.value || largestAccounts.value.length === 0) {
        console.log('📊 No token holders found');
        return [];
      }
      
      console.log(`📊 Found ${largestAccounts.value.length} token accounts`);
      
      const holders: TokenHolder[] = [];
      
      // Get owner for each token account
      for (const account of largestAccounts.value) {
        if (!account.address || account.uiAmount === 0) continue;
        
        try {
          // Get the account info to find the owner
          const accountInfo = await connection.getParsedAccountInfo(account.address);
          
          if (accountInfo.value && 'parsed' in accountInfo.value.data) {
            const parsed = accountInfo.value.data.parsed;
            const owner = parsed.info?.owner;
            const amount = Number(account.amount);
            
            if (owner && amount > 0 && !this.isSystemAccount(owner)) {
              holders.push({
                wallet: owner,
                tokenBalance: amount,
                rank: 0,
              });
            }
          }
        } catch (e) {
          // Skip if can't get owner
        }
      }
      
      // Sort by balance descending
      holders.sort((a, b) => b.tokenBalance - a.tokenBalance);
      
      // Assign ranks
      holders.forEach((holder, index) => {
        holder.rank = index + 1;
      });
      
      return holders;
    } catch (error) {
      console.error('Error fetching token holders:', error);
      return [];
    }
  }

  // Check if address is a system/program account (exclude from leaderboard)
  private isSystemAccount(address: string): boolean {
    // Get the bonding curve PDA for this token
    const bondingCurvePDA = getBondingCurvePDA(new PublicKey(config.moltdownTokenMint));
    
    const systemAddresses = [
      '11111111111111111111111111111111', // System program
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token program
      'So11111111111111111111111111111111111111112', // Wrapped SOL
      config.moltdownTokenMint, // The token mint itself
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // pump.fun program
      bondingCurvePDA.toBase58(), // pump.fun bonding curve for this token
    ];
    
    return systemAddresses.includes(address);
  }

  // Get current Alpha Claw (top holder)
  async getAlphaClaw(): Promise<TokenHolder | null> {
    return getCachedAlphaClaw();
  }

  // Get top N holders from cache
  async getLeaderboard(limit: number = 5): Promise<TokenHolder[]> {
    return getTopHolders(limit);
  }
}

export const holderTracker = new HolderTracker();
