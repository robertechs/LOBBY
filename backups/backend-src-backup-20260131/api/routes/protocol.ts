import { Router, Request, Response } from 'express';
import { cycleManager } from '../../services/cycleManager';
import { getRecentCycles, getCycleByNumber } from '../../utils/db';
import { DISTRIBUTION_SPLIT } from '../../types';
import { getCurrentTank, getCachedAlphaClaw, getHolderCount } from '../../utils/redis';

export const protocolRouter = Router();

const SOL_PRICE = 190; // Could fetch live price

// Get current protocol status (The Boil)
protocolRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await cycleManager.getCurrentCycleStatus();

    // Tank is updated every 3 seconds by tankTracker (only creator rewards)
    const tankSol = await getCurrentTank();
    const tankUsd = tankSol * SOL_PRICE;
    
    // Alpha Claw from live blockchain holder data (not trade-based)
    const alphaClaw = await getCachedAlphaClaw();
    const holderCount = await getHolderCount();

    res.json({
      cycleNumber: status.cycleNumber,
      heatLevel: status.heatLevel, // 0-100%
      timeLeftMs: status.timeRemaining,
      timeLeftSeconds: Math.floor(status.timeRemaining / 1000),
      tankSol,
      tankUsd,
      participants: holderCount, // Total token holders
      alphaClaw: alphaClaw
        ? {
            wallet: alphaClaw.wallet,
            tokenBalance: alphaClaw.tokenBalance,
            tokenBalanceFormatted: (alphaClaw.tokenBalance / 1_000_000).toFixed(2),
          }
        : null,
      distribution: {
        alphaPercent: DISTRIBUTION_SPLIT.alphaPercent * 100,
        shatterPercent: DISTRIBUTION_SPLIT.shatterPercent * 100,
      },
    });
  } catch (error) {
    console.error('Error getting protocol status:', error);
    res.status(500).json({ error: 'Failed to get protocol status' });
  }
});

// Legacy endpoint - maps to new status
protocolRouter.get('/current', async (_req: Request, res: Response) => {
  try {
    const status = await cycleManager.getCurrentCycleStatus();

    // Tank is updated every 3 seconds by tankTracker
    const potSizeSol = await getCurrentTank();
    const potSizeUsd = potSizeSol * SOL_PRICE;
    
    // Alpha Claw from live blockchain holder data
    const alphaClaw = await getCachedAlphaClaw();
    const holderCount = await getHolderCount();

    // Format time for legacy compatibility
    const seconds = Math.floor(status.timeRemaining / 1000);
    const timeLeftFormatted = `${seconds}s`;

    res.json({
      roundNumber: status.cycleNumber,
      timeLeftMs: status.timeRemaining,
      timeLeftFormatted,
      potSizeSol,
      potSizeUsd,
      participants: holderCount,
      champion: alphaClaw
        ? {
            wallet: alphaClaw.wallet,
            tokenBalance: alphaClaw.tokenBalance,
          }
        : null,
      // New fields
      heatLevel: status.heatLevel,
      distribution: {
        alphaPercent: DISTRIBUTION_SPLIT.alphaPercent * 100,
        shatterPercent: DISTRIBUTION_SPLIT.shatterPercent * 100,
        // Legacy fields (deprecated)
        championPercent: DISTRIBUTION_SPLIT.alphaPercent * 100,
        buybackPercent: DISTRIBUTION_SPLIT.shatterPercent * 100,
        holderPercent: 0,
        boostPercent: 0,
      },
    });
  } catch (error) {
    console.error('Error getting current round:', error);
    res.status(500).json({ error: 'Failed to get current round' });
  }
});

// Get cycle history
protocolRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const cycles = await getRecentCycles(limit);

    res.json({
      cycles: cycles.map((c) => ({
        cycleNumber: c.roundNumber,
        startTime: c.startTime,
        endTime: c.endTime,
        alphaWallet: c.championWallet,
        alphaBought: Number(c.championBought),
        totalTankSol: Number(c.totalPotSol),
        alphaExtraction: Number(c.championPayout),
        shatterAmount: Number(c.buybackAmount),
        participants: c.participants,
        txAlpha: c.txChampion,
        txShatter: c.txBuyback,
      })),
      // Legacy format
      rounds: cycles.map((c) => ({
        roundNumber: c.roundNumber,
        startTime: c.startTime,
        endTime: c.endTime,
        championWallet: c.championWallet,
        championBought: Number(c.championBought),
        totalPotSol: Number(c.totalPotSol),
        championPayout: Number(c.championPayout),
        buybackAmount: Number(c.buybackAmount),
        participants: c.participants,
        txChampion: c.txChampion,
        txBuyback: c.txBuyback,
      })),
    });
  } catch (error) {
    console.error('Error getting cycle history:', error);
    res.status(500).json({ error: 'Failed to get cycle history' });
  }
});

// Get specific cycle by number
protocolRouter.get('/:cycleNumber', async (req: Request, res: Response) => {
  try {
    const cycleNumber = parseInt(req.params.cycleNumber);

    if (isNaN(cycleNumber)) {
      res.status(400).json({ error: 'Invalid cycle number' });
      return;
    }

    const cycle = await getCycleByNumber(cycleNumber);

    if (!cycle) {
      res.status(404).json({ error: 'Cycle not found' });
      return;
    }

    res.json({
      cycleNumber: cycle.roundNumber,
      startTime: cycle.startTime,
      endTime: cycle.endTime,
      alphaWallet: cycle.championWallet,
      alphaBought: Number(cycle.championBought),
      totalTankSol: Number(cycle.totalPotSol),
      alphaExtraction: Number(cycle.championPayout),
      shatterAmount: Number(cycle.buybackAmount),
      participants: cycle.participants,
      txAlpha: cycle.txChampion,
      txShatter: cycle.txBuyback,
      status: cycle.status,
    });
  } catch (error) {
    console.error('Error getting cycle:', error);
    res.status(500).json({ error: 'Failed to get cycle' });
  }
});
