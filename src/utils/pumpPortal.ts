import { config } from '../config';

interface SwapResponse {
  success: boolean;
  txSignature?: string;
  error?: string;
}

interface TradeParams {
  publicKey: string;
  action: 'buy' | 'sell';
  mint: string;
  amount: number; // in SOL for buy, tokens for sell
  denominatedInSol: 'true' | 'false';
  slippage: number;
  priorityFee: number;
  pool: 'pump' | 'raydium';
}

interface SwapApiResponse {
  signature?: string;
}

// Execute a swap via PumpPortal API (Local Transaction method)
export async function executeSwap(params: TradeParams): Promise<SwapResponse> {
  try {
    const response = await fetch(`${config.pumpPortalApiUrl}/trade-local`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`PumpPortal API error: ${response.status}`);
    }

    const data = (await response.json()) as SwapApiResponse;
    return {
      success: true,
      txSignature: data.signature,
    };
  } catch (error) {
    console.error('Swap execution failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Buy tokens with SOL
export async function buyTokens(
  publicKey: string,
  mintAddress: string,
  solAmount: number,
  slippage: number = 1
): Promise<SwapResponse> {
  return executeSwap({
    publicKey,
    action: 'buy',
    mint: mintAddress,
    amount: solAmount,
    denominatedInSol: 'true',
    slippage,
    priorityFee: 0.0001, // Small priority fee
    pool: 'pump',
  });
}

// Sell tokens for SOL
export async function sellTokens(
  publicKey: string,
  mintAddress: string,
  tokenAmount: number,
  slippage: number = 1
): Promise<SwapResponse> {
  return executeSwap({
    publicKey,
    action: 'sell',
    mint: mintAddress,
    amount: tokenAmount,
    denominatedInSol: 'false',
    slippage,
    priorityFee: 0.0001,
    pool: 'pump',
  });
}

interface TokenInfo {
  mint?: string;
  name?: string;
  symbol?: string;
  creatorVaultBalance?: string;
  marketCap?: number;
}

// Get token info from PumpPortal
export async function getTokenInfo(mintAddress: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(
      `${config.pumpPortalApiUrl}/token/${mintAddress}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get token info: ${response.status}`);
    }

    return (await response.json()) as TokenInfo;
  } catch (error) {
    console.error('Failed to get token info:', error);
    return null;
  }
}

// Get creator vault balance (unclaimed rewards)
export async function getCreatorVaultBalance(mintAddress: string): Promise<number> {
  try {
    const tokenInfo = await getTokenInfo(mintAddress);
    if (tokenInfo && tokenInfo.creatorVaultBalance) {
      return parseFloat(tokenInfo.creatorVaultBalance);
    }
    return 0;
  } catch (error) {
    console.error('Failed to get creator vault balance:', error);
    return 0;
  }
}

interface CreatorRewardsResponse {
  totalUnclaimedSol?: number;
  totalUnclaimedUsd?: number;
  tokens?: Array<{
    mint: string;
    unclaimedSol: number;
    unclaimedUsd: number;
  }>;
}

// Get live creator rewards from pump.fun API
export async function getLiveCreatorRewards(creatorWallet: string): Promise<{ sol: number; usd: number }> {
  try {
    // Try multiple API endpoints
    const endpoints = [
      `https://frontend-api-v3.pump.fun/creators/${creatorWallet}`,
      `https://frontend-api.pump.fun/creators/${creatorWallet}`,
      `https://client-api-2-74b1891ee9f9.herokuapp.com/creators/${creatorWallet}`,
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://pump.fun',
            'Referer': 'https://pump.fun/',
          },
        });

        if (response.ok) {
          const data = await response.json() as CreatorRewardsResponse;
          if (data.totalUnclaimedSol || data.totalUnclaimedUsd) {
            console.log(`Got creator rewards from ${url}: ${data.totalUnclaimedSol} SOL`);
            return {
              sol: data.totalUnclaimedSol || 0,
              usd: data.totalUnclaimedUsd || 0,
            };
          }
        }
      } catch (e) {
        // Try next endpoint
      }
    }

    // Fallback: Try to get from token-specific endpoint
    try {
      const tokenUrl = `https://frontend-api-v3.pump.fun/coins/${config.moltdownTokenMint}`;
      const tokenRes = await fetch(tokenUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      });
      
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json() as { creator_fee_unclaimed?: string };
        if (tokenData.creator_fee_unclaimed) {
          const sol = parseFloat(tokenData.creator_fee_unclaimed) / 1e9;
          return { sol, usd: sol * 190 };
        }
      }
    } catch (e) {
      // Ignore
    }

    console.log('Creator rewards API: No valid response from any endpoint');
    return { sol: 0, usd: 0 };
  } catch (error) {
    console.error('Failed to get live creator rewards:', error);
    return { sol: 0, usd: 0 };
  }
}

// Get creator rewards for specific token
export async function getTokenCreatorRewards(
  creatorWallet: string,
  tokenMint: string
): Promise<{ sol: number; usd: number }> {
  try {
    const response = await fetch(
      `https://frontend-api-v3.pump.fun/creators/${creatorWallet}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      }
    );

    if (!response.ok) {
      return { sol: 0, usd: 0 };
    }    const data = await response.json() as CreatorRewardsResponse;
    
    // Find the specific token's rewards
    const tokenRewards = data.tokens?.find(t => t.mint === tokenMint);
    
    if (tokenRewards) {
      return {
        sol: tokenRewards.unclaimedSol || 0,
        usd: tokenRewards.unclaimedUsd || 0,
      };
    }

    // If no specific token found, return total
    return {
      sol: data.totalUnclaimedSol || 0,
      usd: data.totalUnclaimedUsd || 0,
    };
  } catch (error) {
    console.error('Failed to get token creator rewards:', error);
    return { sol: 0, usd: 0 };
  }
}