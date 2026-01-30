import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { config } from '../config';
import { connection } from './solana';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// SOL mint address (native)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
  contextSlot?: number;
  timeTaken?: number;
}

interface SwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

interface SwapResult {
  success: boolean;
  txSignature?: string;
  tokensReceived?: number;
  error?: string;
}

/**
 * Get a quote for swapping SOL to a token
 */
export async function getSwapQuote(
  outputMint: string,
  solAmountLamports: number,
  slippageBps: number = 100 // 1% default slippage
): Promise<QuoteResponse | null> {
  try {
    const params = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: outputMint,
      amount: solAmountLamports.toString(),
      slippageBps: slippageBps.toString(),
      swapMode: 'ExactIn',
    });

    const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jupiter quote error:', errorText);
      return null;
    }

    return await response.json() as QuoteResponse;
  } catch (error) {
    console.error('Failed to get Jupiter quote:', error);
    return null;
  }
}

/**
 * Execute a swap using Jupiter
 */
export async function executeJupiterSwap(
  wallet: Keypair,
  outputMint: string,
  solAmount: number,
  slippageBps: number = 100
): Promise<SwapResult> {
  try {
    const solAmountLamports = Math.floor(solAmount * 1e9);
    
    console.log(`🔄 Getting Jupiter quote for ${solAmount} SOL -> ${outputMint.slice(0, 8)}...`);
    
    // Step 1: Get quote
    const quote = await getSwapQuote(outputMint, solAmountLamports, slippageBps);
    
    if (!quote) {
      return { success: false, error: 'Failed to get quote' };
    }

    console.log(`📊 Quote: ${quote.outAmount} tokens, price impact: ${quote.priceImpactPct}%`);

    // Step 2: Get swap transaction
    const swapResponse = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: 'high',
          },
        },
      }),
    });

    if (!swapResponse.ok) {
      const errorText = await swapResponse.text();
      console.error('Jupiter swap error:', errorText);
      return { success: false, error: `Swap request failed: ${errorText}` };
    }

    const swapData = await swapResponse.json() as SwapResponse;

    // Step 3: Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    // Sign the transaction
    transaction.sign([wallet]);

    // Step 4: Send transaction
    console.log('📤 Sending swap transaction...');
    const txSignature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3,
    });

    console.log(`📝 Tx sent: ${txSignature}`);

    // Step 5: Confirm transaction
    const latestBlockHash = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: swapData.lastValidBlockHeight,
      signature: txSignature,
    }, 'confirmed');

    if (confirmation.value.err) {
      console.error('Transaction failed:', confirmation.value.err);
      return { success: false, error: 'Transaction failed on-chain', txSignature };
    }

    console.log(`✅ Swap confirmed: ${txSignature}`);
    
    return {
      success: true,
      txSignature,
      tokensReceived: parseInt(quote.outAmount),
    };
  } catch (error) {
    console.error('Jupiter swap failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Buy tokens with SOL using Jupiter
 */
export async function buyTokensWithJupiter(
  wallet: Keypair,
  tokenMint: string,
  solAmount: number,
  slippageBps: number = 150 // 1.5% slippage for buying
): Promise<SwapResult> {
  return executeJupiterSwap(wallet, tokenMint, solAmount, slippageBps);
}


