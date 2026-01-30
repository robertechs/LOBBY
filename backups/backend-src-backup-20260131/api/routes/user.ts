import { Router, Request, Response } from 'express';
import { getBuyerRank, getBuyerTotal } from '../../utils/redis';
import { getUnclaimedRewards } from '../../services/holderRewards';
import { getUserWinCount, getUserTotalEarnings, getUserTrades } from '../../utils/db';

export const userRouter = Router();

// Get user stats
userRouter.get('/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;

    if (!wallet || wallet.length !== 44) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }

    const [
      currentRank,
      currentBought,
      unclaimedRewards,
      totalWins,
      totalEarnings,
    ] = await Promise.all([
      getBuyerRank(wallet),
      getBuyerTotal(wallet),
      getUnclaimedRewards(wallet),
      getUserWinCount(wallet),
      getUserTotalEarnings(wallet),
    ]);

    res.json({
      wallet,
      currentRound: {
        rank: currentRank || null,
        totalBoughtSol: currentBought,
        isParticipating: currentRank > 0,
      },
      overall: {
        totalWins,
        totalEarnedSol: totalEarnings,
        unclaimedRewardsSol: unclaimedRewards,
      },
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
});

// Get user's trade history
userRouter.get('/:wallet/trades', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!wallet || wallet.length !== 44) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }

    const trades = await getUserTrades(wallet, limit);

    res.json({
      wallet,
      trades: trades.map((t) => ({
        roundId: t.roundId,
        solAmount: Number(t.solAmount),
        tokenAmount: Number(t.tokenAmount),
        txSignature: t.txSignature,
        timestamp: t.timestamp,
      })),
      count: trades.length,
    });
  } catch (error) {
    console.error('Error getting user trades:', error);
    res.status(500).json({ error: 'Failed to get user trades' });
  }
});

