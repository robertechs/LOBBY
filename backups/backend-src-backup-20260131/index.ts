import { config } from './config';
import { connectDatabase, disconnectDatabase } from './utils/db';
import { redis } from './utils/redis';
import { tradeTracker } from './services/tradeTracker';
import { cycleManager } from './services/cycleManager';
import { tankTracker } from './services/tankTracker';
import { holderTracker } from './services/holderTracker';
import { startServer } from './api/server';

async function main() {
  console.log('========================================');
  console.log('🦞 $MOLTDOWN - The Molt Pit');
  console.log('========================================');
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Cycle Duration: ${config.cycleDurationMs / 1000} seconds`);
  console.log(`Token Mint: ${config.moltdownTokenMint}`);
  console.log(`Distribution: 70% Alpha / 30% Buyback & Burn`);
  console.log('----------------------------------------');

  try {
    // Connect to databases
    console.log('\n📦 Connecting to databases...');
    await connectDatabase();
    // Redis connects automatically via ioredis

    // Start holder tracker (fetches live token holders from blockchain every 3s)
    console.log('\n📊 Starting Holder Tracker...');
    await holderTracker.start();

    // Start tank tracker (polls wallet balance every 3s)
    console.log('\n💰 Starting Tank Tracker...');
    await tankTracker.start();

    // Start trade tracker (WebSocket - for logging only)
    console.log('\n📡 Starting Trade Tracker...');
    await tradeTracker.start();

    // Subscribe to trade events for logging
    tradeTracker.onTrade((trade) => {
      console.log(
        `🦞 Trade: ${trade.wallet.slice(0, 8)}... bought ${trade.solAmount.toFixed(4)} SOL worth`
      );
    });

    // Start cycle manager (The Boil Protocol)
    console.log('\n🔥 Starting The Boil Protocol...');
    await cycleManager.start();

    // Start API server
    console.log('\n🌐 Starting API server...');
    startServer();

    console.log('\n========================================');
    console.log('🦞 $MOLTDOWN - The Molt Pit Active!');
    console.log('   Dominant position wins. Rest get cooked.');
    console.log('========================================\n');

    // Get initial status
    const status = await cycleManager.getCurrentCycleStatus();
    console.log(`Current Cycle: #${status.cycleNumber}`);
    console.log(`Protocol Heat: ${status.heatLevel}%`);
    console.log(`Time Until Boil: ${status.timeRemainingFormatted}`);
    console.log(`Tank Value: ${status.tank.toFixed(4)} SOL`);
    console.log(`Participants: ${status.participants}`);
    if (status.alphaClaw) {
      console.log(`Alpha Claw: ${status.alphaClaw.wallet.slice(0, 8)}...`);
    }
    console.log('');
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('\n\n🦞 Shutting down The Boil Protocol...');

  holderTracker.stop();
  tankTracker.stop();
  tradeTracker.stop();
  cycleManager.stop();
  await disconnectDatabase();
  // Upstash uses REST API, no disconnect needed

  console.log('See you at the next molt! 🦞');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the application
main();
