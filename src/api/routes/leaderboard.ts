import { Router, Request, Response } from 'express';
import { getTopHolders, getHolderCount, getHolderLastUpdate } from '../../utils/redis';

export const leaderboardRouter = Router();

// Get live token holders (fetched from blockchain every 3 seconds)
leaderboardRouter.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const holders = await getTopHolders(limit);
    const totalHolders = await getHolderCount();
    const lastUpdate = await getHolderLastUpdate();

    res.json({
      // Current positions (live from blockchain, NOT reset per cycle)
      leaderboard: holders.map((holder) => ({
        rank: holder.rank,
        wallet: holder.wallet,
        walletShort: `${holder.wallet.slice(0, 4)}...${holder.wallet.slice(-4)}`,
        tokenBalance: holder.tokenBalance,
        // Format for display (tokens have 6 decimals on pump.fun)
        tokenBalanceFormatted: (holder.tokenBalance / 1_000_000).toFixed(2),
      })),
      count: holders.length,
      totalHolders,
      lastUpdate,
      // Indicate this is live data
      source: 'blockchain',
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// Get specific wallet's position in holder rankings
leaderboardRouter.get('/position/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;

    if (!wallet || wallet.length < 32) {
      res.status(400).json({ error: 'Invalid wallet address' });
      return;
    }

    // Get all holders and find this wallet
    const holders = await getTopHolders(50);
    const holder = holders.find(h => h.wallet === wallet);

    if (!holder) {
      res.json({
        wallet,
        inLeaderboard: false,
        rank: null,
        tokenBalance: 0,
      });
      return;
    }

    res.json({
      wallet,
      inLeaderboard: true,
      rank: holder.rank,
      tokenBalance: holder.tokenBalance,
      tokenBalanceFormatted: (holder.tokenBalance / 1_000_000).toFixed(2),
    });
  } catch (error) {
    console.error('Error getting position:', error);
    res.status(500).json({ error: 'Failed to get position' });
  }
});
