import { config } from '../config';
import { getCreatorWallet, sendSol } from '../utils/solana';
import { executeShellShatter } from './shellShatter';

interface DistributionParams {
  alphaWallet: string;
  alphaExtraction: number; // 70%
  shatterAmount: number;   // 30%
}

interface DistributionResult {
  txAlpha: string | null;
  txShatter: string | null;
  errors: string[];
}

// Execute the full distribution (The Boil Protocol)
export async function distributeRewards(
  params: DistributionParams
): Promise<DistributionResult> {
  const result: DistributionResult = {
    txAlpha: null,
    txShatter: null,
    errors: [],
  };

  // Use creator wallet for all distributions (rewards flow here)
  const creatorWallet = getCreatorWallet();

  // 1. Alpha Extraction (70%) - Pay the Alpha Claw
  if (params.alphaExtraction > 0.001) {
    // Min 0.001 SOL to avoid dust
    try {
      console.log(
        `🦞 Alpha Extraction to ${params.alphaWallet}: ${params.alphaExtraction.toFixed(4)} SOL`
      );
      result.txAlpha = await sendSol(
        creatorWallet,
        params.alphaWallet,
        params.alphaExtraction
      );
      console.log(`✅ Alpha Claw paid. Tx: ${result.txAlpha}`);
    } catch (error) {
      const msg = `Failed to pay Alpha Claw: ${error}`;
      console.error(msg);
      result.errors.push(msg);
    }
  }

  // 2. Shell Shatter (30%) - Buyback & burn
  if (params.shatterAmount > 0.001) {
    try {
      console.log(`🔥 Shell Shatter: ${params.shatterAmount.toFixed(4)} SOL`);
      result.txShatter = await executeShellShatter(params.shatterAmount);
      if (result.txShatter) {
        console.log(`✅ Shell Shatter complete. Tx: ${result.txShatter}`);
      } else {
        console.log(`⚠️ Shell Shatter skipped or failed (no tx returned)`);
      }
    } catch (error) {
      const msg = `Failed to execute Shell Shatter: ${error}`;
      console.error(msg);
      result.errors.push(msg);
    }
  }

  if (result.errors.length > 0) {
    console.warn(`Distribution completed with ${result.errors.length} errors`);
  } else {
    console.log('🦞 Protocol execution completed successfully');
  }

  return result;
}
