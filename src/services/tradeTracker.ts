import WebSocket from 'ws';
import { config } from '../config';
import { PumpTrade, MoltdownBuy } from '../types';
import { addBuyerAmount, addToTank, addToVolume } from '../utils/redis';

type TradeCallback = (trade: MoltdownBuy) => void;

// Batch queue for high-volume handling
interface PendingTrade {
  wallet: string;
  solAmount: number;
}

class TradeTracker {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private callbacks: TradeCallback[] = [];
  private isRunning = false;
  
  // Batching for high volume
  private pendingTrades: Map<string, number> = new Map();
  private pendingSellVolume: number = 0; // Track sell volume separately for pot
  private batchInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_INTERVAL_MS = 2000; // Flush every 2 seconds

  // Subscribe to trade events
  onTrade(callback: TradeCallback): void {
    this.callbacks.push(callback);
  }

  // Start listening to trades
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('TradeTracker already running');
      return;
    }

    this.isRunning = true;
    await this.connect();
    
    // Start batch processor
    this.batchInterval = setInterval(() => {
      this.flushPendingTrades();
    }, this.BATCH_INTERVAL_MS);
  }

  // Stop listening
  stop(): void {
    this.isRunning = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    // Flush any remaining trades
    this.flushPendingTrades();
  }
  
  // Flush pending trades to Redis (batched)
  private async flushPendingTrades(): Promise<void> {
    if (this.pendingTrades.size === 0 && this.pendingSellVolume === 0) return;
    
    const tradesToProcess = new Map(this.pendingTrades);
    const sellVolume = this.pendingSellVolume;
    this.pendingTrades.clear();
    this.pendingSellVolume = 0;
    
    let buyVolume = 0;
    
    // Process all pending buy trades (for leaderboard)
    for (const [wallet, amount] of tradesToProcess) {
      try {
        await addBuyerAmount(wallet, amount);
        buyVolume += amount;
      } catch (error) {
        console.error(`Failed to add buyer amount for ${wallet}:`, error);
        // Re-add to pending on failure
        const existing = this.pendingTrades.get(wallet) || 0;
        this.pendingTrades.set(wallet, existing + amount);
      }
    }
    
    // Total volume = buys + sells (for accurate creator fee calculation)
    const totalVolume = buyVolume + sellVolume;
    
    // Track volume and calculate creator rewards (0.5% of total volume)
    if (totalVolume > 0) {
      // Track total volume for the round (buys + sells)
      await addToVolume(totalVolume);
      
      // Add estimated creator rewards to tank (0.5% of total volume)
      const creatorRewardEstimate = totalVolume * 0.005;
      await addToTank(creatorRewardEstimate);
      
      console.log(`🦞 Batch: ${tradesToProcess.size} positions (${buyVolume.toFixed(4)} SOL), sells (${sellVolume.toFixed(4)} SOL), +${creatorRewardEstimate.toFixed(6)} SOL to tank`);
    }
  }

  private async connect(): Promise<void> {
    console.log('Connecting to PumpStream WebSocket...');

    this.ws = new WebSocket(config.pumpStreamWsUrl);

    this.ws.on('open', () => {
      console.log('Connected to PumpStream WebSocket');
      this.reconnectAttempts = 0;

      // Subscribe to trades for our token
      this.subscribeToToken(config.moltdownTokenMint);
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('WebSocket connection closed');
      if (this.isRunning) {
        this.attemptReconnect();
      }
    });
  }

  private subscribeToToken(mint: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Subscribe to trade events for specific token
    const subscribeMessage = {
      method: 'subscribeTokenTrade',
      keys: [mint],
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log(`Subscribed to trades for token: ${mint}`);
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      // Check if it's a trade event for our token
      if (message.mint === config.moltdownTokenMint) {
        console.log(`📨 Trade for $MOLTDOWN: ${message.txType} by ${message.traderPublicKey?.slice(0,8)}...`);
        
        if (message.txType) {
          this.processTrade(message as PumpTrade);
        }
      }
    } catch (error) {
      // Ignore parse errors (some messages are pings/status)
    }
  }

  private async processTrade(trade: PumpTrade): Promise<void> {
    // PumpStream sends solAmount in lamports - convert to SOL
    const solAmount = trade.solAmount / 1_000_000_000;
    const wallet = trade.traderPublicKey;
    
    console.log(`🔥 Trade detected: ${wallet.slice(0,8)}... ${trade.txType} ${solAmount.toFixed(4)} SOL`);

    if (trade.txType === 'buy') {
      // Add to pending batch for leaderboard (aggregate by wallet)
      const existing = this.pendingTrades.get(wallet) || 0;
      this.pendingTrades.set(wallet, existing + solAmount);

      const moltdownBuy: MoltdownBuy = {
        wallet,
        solAmount,
        tokenAmount: trade.tokenAmount,
        txSignature: trade.signature,
        timestamp: new Date(trade.timestamp),
      };

      console.log(
        `🦞 Position: ${wallet.slice(0, 8)}... +${solAmount.toFixed(4)} SOL (queued)`
      );

      // Notify callbacks (for real-time UI updates)
      this.callbacks.forEach((cb) => cb(moltdownBuy));
    } else if (trade.txType === 'sell') {
      // Track sell volume for accurate tank calculation (creator fees are on all trades)
      this.pendingSellVolume += solAmount;
      console.log(
        `📤 Exit: ${wallet.slice(0, 8)}... ${solAmount.toFixed(4)} SOL (tracked for tank)`
      );
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(
      `Attempting to reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      if (this.isRunning) {
        this.connect();
      }
    }, delay);
  }
}

// Export singleton instance
export const tradeTracker = new TradeTracker();

