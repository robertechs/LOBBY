import { Router, Request, Response } from 'express';
import { addBuyerAmount, resetCycleData, setCycleNumber } from '../../utils/redis';
import { cycleManager } from '../../services/cycleManager';
import { claimCreatorFees } from '../../services/rewardClaimer';
import { getSolBalance, getCreatorWallet } from '../../utils/solana';
import { prisma } from '../../utils/db';

export const testRouter = Router();

/**
 * POST /api/test/simulate-buy
 * Simulates a buy for testing - adds a wallet to the leaderboard
 */
testRouter.post('/simulate-buy', async (req: Request, res: Response) => {
  try {
    const { wallet, solAmount } = req.body;

    if (!wallet || !solAmount) {
      res.status(400).json({ error: 'wallet and solAmount required' });
      return;
    }

    // Add to leaderboard
    await addBuyerAmount(wallet, solAmount);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test.ts:simulate-buy',message:'Simulated buy added',data:{wallet,solAmount},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TEST'})}).catch(()=>{});
    // #endregion

    console.log(`🧪 TEST: Simulated buy - ${wallet} bought ${solAmount} SOL`);

    res.json({
      success: true,
      message: `Simulated ${solAmount} SOL buy for ${wallet}`,
    });
  } catch (error) {
    console.error('Test simulate-buy error:', error);
    res.status(500).json({ error: 'Failed to simulate buy' });
  }
});

/**
 * POST /api/test/force-round-end
 * Forces the current round to end immediately (for testing)
 */
testRouter.post('/force-round-end', async (_req: Request, res: Response) => {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test.ts:force-round-end',message:'Force round end triggered',timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'TEST'})}).catch(()=>{});
    // #endregion

    console.log('🧪 TEST: Forcing cycle end...');
    await cycleManager.executeBoil();

    res.json({
      success: true,
      message: 'Round ended manually',
    });
  } catch (error) {
    console.error('Test force-round-end error:', error);
    res.status(500).json({ error: 'Failed to force round end' });
  }
});

/**
 * POST /api/test/claim-rewards
 * Claims creator fees from pump.fun
 */
testRouter.post('/claim-rewards', async (_req: Request, res: Response) => {
  try {
    console.log('🧪 TEST: Claiming creator rewards...');
    
    const creatorWallet = getCreatorWallet();
    const balanceBefore = await getSolBalance(creatorWallet.publicKey.toString());
    
    const result = await claimCreatorFees();
    
    const balanceAfter = await getSolBalance(creatorWallet.publicKey.toString());
    const claimed = balanceAfter - balanceBefore;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test.ts:claim-rewards',message:'Claim result',data:{success:result.success,txSignature:result.txSignature,error:result.error,balanceBefore,balanceAfter,claimed},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'CLAIM'})}).catch(()=>{});
    // #endregion

    res.json({
      success: result.success,
      txSignature: result.txSignature,
      error: result.error,
      balanceBefore,
      balanceAfter,
      claimed,
    });
  } catch (error) {
    console.error('Test claim-rewards error:', error);
    res.status(500).json({ error: 'Failed to claim rewards' });
  }
});

/**
 * POST /api/test/full-cycle
 * Full test: claim rewards -> simulate buy -> force round end
 */
/**
 * POST /api/test/reset-all
 * Resets everything - clears Redis and database, starts fresh from Round 1
 */
testRouter.post('/reset-all', async (_req: Request, res: Response) => {
  try {
    console.log('🧪 TEST: Resetting all data...');
    
    // Reset Redis
    await resetCycleData();
    await setCycleNumber(1);
    
    // Clear all cycles from database
    await prisma.executionCycle.deleteMany({});
    
    console.log('✅ All data reset. Starting fresh from Round 1.');
    
    res.json({
      success: true,
      message: 'All data reset. Restart backend to begin Round 1.',
    });
  } catch (error) {
    console.error('Test reset-all error:', error);
    res.status(500).json({ error: 'Failed to reset' });
  }
});

testRouter.post('/full-cycle', async (req: Request, res: Response) => {
  try {
    const { championWallet, buyAmount } = req.body;
    
    if (!championWallet) {
      res.status(400).json({ error: 'championWallet required' });
      return;
    }
    
    console.log('🧪 TEST: Running full cycle...');
    const results: any = { steps: [] };
    
    const creatorWallet = getCreatorWallet();
    
    // Step 1: Check initial balance
    const balanceBefore = await getSolBalance(creatorWallet.publicKey.toString());
    results.balanceBefore = balanceBefore;
    results.steps.push({ step: 'Check balance', balance: balanceBefore });
    
    // Step 2: Claim rewards
    console.log('Step 1: Claiming rewards...');
    const claimResult = await claimCreatorFees();
    results.steps.push({ step: 'Claim rewards', ...claimResult });
    
    // Wait for balance to update
    await new Promise(r => setTimeout(r, 2000));
    
    const balanceAfterClaim = await getSolBalance(creatorWallet.publicKey.toString());
    results.balanceAfterClaim = balanceAfterClaim;
    results.claimed = balanceAfterClaim - balanceBefore;
    results.steps.push({ step: 'Balance after claim', balance: balanceAfterClaim, claimed: results.claimed });
    
    // Step 3: Simulate buy for champion
    console.log(`Step 2: Simulating buy for ${championWallet}...`);
    await addBuyerAmount(championWallet, buyAmount || 0.1);
    results.steps.push({ step: 'Simulate buy', wallet: championWallet, amount: buyAmount || 0.1 });
    
    // Step 4: Force cycle end (triggers distribution)
    console.log('Step 3: Forcing cycle end...');
    await cycleManager.executeBoil();
    results.steps.push({ step: 'Force cycle end', done: true });
    
    // Wait for transactions
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 5: Check final balance
    const balanceFinal = await getSolBalance(creatorWallet.publicKey.toString());
    results.balanceFinal = balanceFinal;
    results.distributed = balanceAfterClaim - balanceFinal;
    results.steps.push({ step: 'Final balance', balance: balanceFinal, distributed: results.distributed });
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/d9cec9ca-02c6-4077-b1b2-d984d0f36972',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'test.ts:full-cycle',message:'Full cycle complete',data:results,timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'FULL'})}).catch(()=>{});
    // #endregion
    
    res.json(results);
  } catch (error) {
    console.error('Test full-cycle error:', error);
    res.status(500).json({ error: String(error) });
  }
});

