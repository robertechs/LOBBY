import { Router, Request, Response } from 'express';
import { cycleManager } from '../../services/cycleManager';
import { getLeaderboard, getCurrentTank, getTotalVolume, getAlphaClaw } from '../../utils/redis';
import { getRecentCycles } from '../../utils/db';
import { DISTRIBUTION_SPLIT } from '../../types';
import { getSolBalance, getCreatorWallet } from '../../utils/solana';
import { getLiveCreatorRewards } from '../../utils/pumpPortal';
import { config } from '../../config';

export const agentRouter = Router();

// Cache for API calls
let cachedStatus: any = null;
let lastStatusFetch = 0;
const STATUS_CACHE_MS = 2000;

/**
 * Agent-friendly endpoint for getting protocol status
 * Optimized for AI agents with clear, consistent response format
 */
agentRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    
    // Return cached status if fresh enough
    if (cachedStatus && (now - lastStatusFetch) < STATUS_CACHE_MS) {
      return res.json(cachedStatus);
    }

    const status = await cycleManager.getCurrentCycleStatus();
    
    // Calculate tank value
    const [trackedTank, totalVolume, creatorBalance] = await Promise.all([
      getCurrentTank(),
      getTotalVolume(),
      getSolBalance(getCreatorWallet().publicKey.toString()),
    ]);
    
    const estimatedRewards = totalVolume * 0.005;
    const tankSol = Math.max(estimatedRewards, trackedTank, creatorBalance - 0.005);

    const response = {
      // Protocol info
      protocol: 'molt-pit',
      version: '2.0.0',
      tagline: 'Dominant position wins. Rest get cooked.',
      
      // Cycle info
      cycle: {
        number: status.cycleNumber,
        heatLevel: status.heatLevel,
        timeLeftMs: status.timeRemaining,
        timeLeftSeconds: Math.floor(status.timeRemaining / 1000),
        isBoiling: status.heatLevel >= 100,
      },
      
      // Tank info
      tank: {
        valueSol: tankSol,
        participants: status.participants,
      },
      
      // Alpha Claw (current leader)
      alphaClaw: status.alphaClaw ? {
        wallet: status.alphaClaw.wallet,
        position: status.alphaClaw.totalBought,
        isLeading: true,
      } : null,
      
      // Distribution on boil
      distribution: {
        alphaPercent: DISTRIBUTION_SPLIT.alphaPercent * 100,
        shatterPercent: DISTRIBUTION_SPLIT.shatterPercent * 100,
        alphaEstimate: tankSol * DISTRIBUTION_SPLIT.alphaPercent,
        shatterEstimate: tankSol * DISTRIBUTION_SPLIT.shatterPercent,
      },
      
      // Timing
      cycleDurationMs: config.cycleDurationMs,
      cycleDurationSeconds: config.cycleDurationMs / 1000,
      
      // Metadata
      timestamp: new Date().toISOString(),
      tokenMint: config.moltdownTokenMint,
    };

    cachedStatus = response;
    lastStatusFetch = now;

    res.json(response);
  } catch (error) {
    console.error('Agent status error:', error);
    res.status(500).json({ 
      error: 'Failed to get protocol status',
      protocol: 'moltdown',
    });
  }
});

/**
 * Get current Alpha Claw (leader)
 */
agentRouter.get('/alpha', async (_req: Request, res: Response) => {
  try {
    const alphaClaw = await getAlphaClaw();
    const status = await cycleManager.getCurrentCycleStatus();
    
    if (!alphaClaw) {
      return res.json({
        hasAlpha: false,
        message: 'No Alpha Claw yet. Be first to take position.',
        cycleNumber: status.cycleNumber,
        heatLevel: status.heatLevel,
      });
    }

    res.json({
      hasAlpha: true,
      wallet: alphaClaw.wallet,
      position: alphaClaw.totalBought,
      cycleNumber: status.cycleNumber,
      heatLevel: status.heatLevel,
      timeLeftSeconds: Math.floor(status.timeRemaining / 1000),
    });
  } catch (error) {
    console.error('Agent alpha error:', error);
    res.status(500).json({ error: 'Failed to get Alpha Claw' });
  }
});

/**
 * Get leaderboard (positions)
 */
agentRouter.get('/positions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const leaderboard = await getLeaderboard(limit);
    
    res.json({
      positions: leaderboard.map(entry => ({
        rank: entry.rank,
        wallet: entry.wallet,
        positionSol: entry.totalBought,
        isAlpha: entry.rank === 1,
      })),
      totalPositions: leaderboard.length,
    });
  } catch (error) {
    console.error('Agent positions error:', error);
    res.status(500).json({ error: 'Failed to get positions' });
  }
});

/**
 * Get recent cycle results
 */
agentRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const cycles = await getRecentCycles(limit);

    res.json({
      cycles: cycles.map(c => ({
        cycleNumber: c.roundNumber,
        alphaWallet: c.championWallet,
        alphaExtraction: Number(c.championPayout),
        shatterAmount: Number(c.buybackAmount),
        totalTank: Number(c.totalPotSol),
        participants: c.participants,
        txAlpha: c.txChampion,
        txShatter: c.txBuyback,
        timestamp: c.endTime,
      })),
    });
  } catch (error) {
    console.error('Agent history error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

/**
 * Simple health check for agents
 */
agentRouter.get('/ping', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    protocol: 'moltdown',
    message: 'Molt or meltdown 🦞',
  });
});
